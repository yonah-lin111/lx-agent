import type {
  AgentCompactResult,
  AgentContextUsage,
  AgentEvent,
  AgentMessage,
  AgentUndoCompactionResult,
} from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import { agentSessionService, createExternalId } from "@/services/agentSessionService"
import { getCompactionSettings, getModelProviderSettings } from "@/services/settingsService"
import {
  type CompactionBoundary,
  createCompactionSummaryMessage,
  estimateCompactedContextTokens,
  estimateContextTokens,
  findCutPoint,
  generateCompactionSummary,
  resolveCompactionModelId,
} from "./compaction"
import type { Agent } from "./core/agent"

// 压缩与上下文容量依赖（AgentRunner 注入宿主状态，解耦子模块）。
export interface ContextCompactorDeps {
  // 当前 Agent 实例（未装配时为 undefined）。
  getAgent: () => Agent | undefined
  // 消息 → DB seq 对齐（压缩边界定位保留起点用）。
  getMessageSeqs: () => number[]
  // 当前落库会话 id。
  getSessionId: () => string | null
  // renderer 最近一次请求的模型选择。
  getRequestedModel: () => ModelSelection | undefined
  // 当前是否忙碌（流式/队列 drain；手动压缩前守卫）。
  isBusy: () => boolean
  // 事件转发（compaction_start/summary/failed、context_usage 等）。
  emit: (event: AgentEvent) => void
}

// 上下文压缩与容量估计：持有压缩边界，驱动自动/手动压缩与状态栏容量快照。
export class ContextCompactor {
  private boundary: CompactionBoundary | null = null

  constructor(private readonly deps: ContextCompactorDeps) {}

  getBoundary(): CompactionBoundary | null {
    return this.boundary
  }

  setBoundary(boundary: CompactionBoundary | null): void {
    this.boundary = boundary
  }

  // 从 DB 读取最近 compaction entry 并建立边界（restoreSession 用）。
  loadBoundary(sessionId: string): void {
    this.boundary = this.readBoundary(sessionId)
  }

  // 读取会话最近的 compaction entry，重建压缩边界（无/无效则 null）。
  readBoundary(sessionId: string): CompactionBoundary | null {
    const entries = agentSessionService.listEntries(sessionId)
    for (let index = entries.length - 1; index >= 0; index--) {
      const entry = entries[index]
      if (entry.type !== "compaction") continue
      try {
        const parsed = JSON.parse(entry.payload) as Partial<CompactionBoundary>
        // firstKeptSeq < 0 的边界无效（保留起点无法定位）：忽略，避免恢复时摘要被插到列表顶部。
        if (
          typeof parsed.summary === "string" &&
          typeof parsed.firstKeptSeq === "number" &&
          parsed.firstKeptSeq >= 0 &&
          typeof parsed.tokensBefore === "number"
        ) {
          // 旧 entry 无 manual 字段：按自动压缩处理（不可撤销），避免存量数据不可用。
          return {
            summary: parsed.summary,
            firstKeptSeq: parsed.firstKeptSeq,
            tokensBefore: parsed.tokensBefore,
            manual: parsed.manual === true,
            model: parsed.model,
            usage: parsed.usage,
          }
        }
      } catch {
        // 损坏 entry 跳过，继续往前找。
      }
    }
    return null
  }

  // 当前会话待发送上下文的 token 估计：有压缩边界按摘要+保留尾部（char/4），否则全量估计。
  currentTokens(): number {
    const messages = this.deps.getAgent()?.state.messages ?? []
    const boundary = this.boundary
    if (!boundary) return estimateContextTokens(messages)
    const kept = messages.filter(
      (_, index) => (this.deps.getMessageSeqs()[index] ?? -1) >= boundary.firstKeptSeq,
    )
    return estimateCompactedContextTokens(
      createCompactionSummaryMessage(
        boundary.summary,
        boundary.tokensBefore,
        boundary.manual,
        boundary.model,
        boundary.usage,
      ),
      kept,
    )
  }

  // 解析上下文窗口：优先显式 selection / 当前会话模型的 limit.context（反映真实容量），
  // 模型未声明窗口时回退压缩配置窗口。
  resolveWindow(selection?: ModelSelection): number {
    const settings = getModelProviderSettings()
    const agent = this.deps.getAgent()
    const activeSelection = selection ?? this.deps.getRequestedModel()
    const modelWindow = activeSelection
      ? settings.providers[activeSelection.provider]?.models?.[activeSelection.model]?.limit
          ?.context
      : agent?.state.model
        ? settings.providers[agent.state.model.provider]?.models?.[agent.state.model.id]?.limit
            ?.context
        : undefined
    return modelWindow ?? getCompactionSettings().contextWindow
  }

  // 上下文容量快照：当前上下文估计 token / 模型实际窗口，驱动状态栏百分比。
  emitUsage(): void {
    this.deps.emit({
      type: "context_usage",
      tokens: this.currentTokens(),
      contextWindow: this.resolveWindow(),
    })
  }

  // 查询当前上下文容量（模型切换后 renderer 主动刷新状态栏用）。
  getUsage(selection?: ModelSelection): AgentContextUsage {
    return {
      tokens: this.currentTokens(),
      contextWindow: this.resolveWindow(selection),
    }
  }

  // 在消息列表底部追加可见摘要块（与实时压缩的 UI 位置一致；
  // 模型上下文仍走 transformContext 的边界拆分，与显示顺序解耦）。
  withSummary(messages: AgentMessage[]): AgentMessage[] {
    const boundary = this.boundary
    if (!boundary) return messages
    const summary = createCompactionSummaryMessage(
      boundary.summary,
      boundary.tokensBefore,
      boundary.manual,
      boundary.model,
      boundary.usage,
    )
    return [...messages, summary]
  }

  // compaction entry 落库（独立事务；摘要不落 message entry，payload 即摘要）。
  private persistCompaction(sessionId: string, boundary: CompactionBoundary): void {
    agentSessionService.transaction(() => {
      const seq = agentSessionService.nextSeq(sessionId)
      agentSessionService.insertEntry({
        externalId: createExternalId(),
        sessionId,
        seq,
        type: "compaction",
        payload: JSON.stringify(boundary),
        createdAt: new Date().toISOString(),
      })
    })
  }

  // 删除会话最近一条 compaction entry（撤销手动压缩时清理落库边界，刷新后不重建摘要）。
  private removeLastCompactionEntry(sessionId: string): void {
    const latest = agentSessionService
      .listEntries(sessionId)
      .filter((entry) => entry.type === "compaction")
      .at(-1)
    if (!latest) return
    agentSessionService.transaction(() => {
      agentSessionService.deleteEntries([latest.external_id])
    })
  }

  // turn 结束后压缩：估计上下文 token 超阈值（或 overflow 强制）时，摘要化早期历史并建立新边界。
  // 返回是否实际压缩；摘要生成失败静默保留旧边界（下轮再试）。
  // overflow 重试与阈值自动均为 manual=false。
  async compactIfNeeded(force: boolean): Promise<boolean> {
    const config = getCompactionSettings()
    if (!config.enabled) return false
    const agent = this.deps.getAgent()
    if (!agent) return false
    const messages = agent.state.messages
    if (messages.length === 0) return false
    // 压缩窗口随当前模型 limit.context 动态（模型切换自动适配，无需手动配固定窗口）。
    // 保留/预留预算受模型窗口约束：配置值超过模型窗口时按比例收敛，避免触发阈值非正导致每轮都压缩。
    const contextWindow = this.resolveWindow()
    const reserveTokens = Math.min(config.reserveTokens, Math.floor(contextWindow * 0.2))
    const keepRecentTokens = Math.min(config.keepRecentTokens, Math.floor(contextWindow * 0.4))
    if (!force) {
      const estimated = estimateContextTokens(messages)
      if (estimated <= contextWindow - reserveTokens) return false
    }
    const cutIndex = findCutPoint(messages, keepRecentTokens)
    if (cutIndex >= messages.length || cutIndex <= 1) return false
    const compacted = messages.slice(0, cutIndex)
    const compactionId = createExternalId()
    const compactionModelId = resolveCompactionModelId(this.deps.getRequestedModel())
    // 摘要生成是压缩的主要耗时（慢 LLM 调用）：先推送开始事件，renderer 追加 loading 占位并禁止发送。
    this.deps.emit({
      type: "compaction_start",
      compactionId,
      manual: false,
      model: compactionModelId,
    })
    const compactionResult = await generateCompactionSummary(
      compacted,
      this.deps.getRequestedModel(),
    )
    if (!compactionResult) {
      // 失败：推送失败事件让 renderer 移除 loading 占位（不建立坏边界，下轮再试）。
      this.deps.emit({ type: "compaction_failed", compactionId, manual: false })
      return false
    }
    const { summary, model, usage } = compactionResult
    const tokensBefore = estimateContextTokens(compacted)
    const firstKeptSeq = this.deps.getMessageSeqs()[cutIndex] ?? -1
    // 保留起点无有效 DB seq（删除轮次后对齐被破坏等）：不建立坏边界，
    // 否则 transformContext 会保留全部消息（压缩失效）且恢复时摘要被插到列表顶部。
    if (firstKeptSeq < 0) {
      // 摘要已生成但无法落位：通知 renderer 移除 loading 占位（否则会卡在压缩中）。
      this.deps.emit({ type: "compaction_failed", compactionId, manual: false })
      return false
    }
    const boundary: CompactionBoundary = {
      summary,
      firstKeptSeq,
      tokensBefore,
      manual: false,
      model,
      usage,
    }
    this.boundary = boundary
    const sessionId = this.deps.getSessionId()
    if (sessionId) {
      this.persistCompaction(sessionId, boundary)
    }
    // 推送可见摘要消息（renderer 以 compactionId 替换对应 loading 占位）。
    this.deps.emit({
      type: "compaction_summary",
      compactionId,
      message: createCompactionSummaryMessage(summary, tokensBefore, false, model, usage),
    })
    // 压缩后容量 = 摘要 + 保留尾部（contextBoundary 已建立，emit 自动走压缩估计）。
    this.emitUsage()
    return true
  }

  // 手动压缩（/compact 命令触发）：尊重设置开关；禁用/忙碌/无可压缩内容时返回具体原因，否则强制压缩。
  // 忙碌守卫兜底 renderer 侧流式判断的竞态（drain 队列等 renderer 不知情的忙态）。
  async compact(): Promise<AgentCompactResult> {
    if (!getCompactionSettings().enabled) {
      return { ok: false, error: "上下文压缩已在设置中禁用，请在设置中开启。" }
    }
    if (this.deps.isBusy()) {
      return { ok: false, error: "当前正在生成回复，请等待回复完成后手动压缩。" }
    }
    const agent = this.deps.getAgent()
    if (!agent || agent.state.messages.length === 0) {
      return { ok: false, error: "当前会话暂无消息，无需压缩。" }
    }
    const messages = agent.state.messages
    if (messages.length <= 1) {
      return { ok: false, error: "历史消息过短，暂无可压缩内容。" }
    }
    const contextWindow = this.resolveWindow()
    const config = getCompactionSettings()
    const keepRecentTokens = Math.min(config.keepRecentTokens, Math.floor(contextWindow * 0.4))
    const cutIndex = findCutPoint(messages, keepRecentTokens)
    const effectiveCut =
      cutIndex >= messages.length || cutIndex <= 1 ? Math.max(1, messages.length - 1) : cutIndex

    if (effectiveCut <= 0 || effectiveCut >= messages.length) {
      return { ok: false, error: "暂无可压缩的历史消息。" }
    }
    const compacted = messages.slice(0, effectiveCut)
    const compactionId = createExternalId()
    const compactionModelId = resolveCompactionModelId(this.deps.getRequestedModel())
    this.deps.emit({
      type: "compaction_start",
      compactionId,
      manual: true,
      model: compactionModelId,
    })
    const compactionResult = await generateCompactionSummary(
      compacted,
      this.deps.getRequestedModel(),
    )
    if (!compactionResult) {
      this.deps.emit({ type: "compaction_failed", compactionId, manual: true })
      return { ok: false, error: "模型生成摘要失败或超时，请稍后重试。" }
    }
    const { summary, model, usage } = compactionResult
    const tokensBefore = estimateContextTokens(compacted)
    const firstKeptSeq = this.deps.getMessageSeqs()[effectiveCut] ?? -1
    if (firstKeptSeq < 0) {
      this.deps.emit({ type: "compaction_failed", compactionId, manual: true })
      return { ok: false, error: "压缩边界定位失败，无法落库。" }
    }
    const boundary: CompactionBoundary = {
      summary,
      firstKeptSeq,
      tokensBefore,
      manual: true,
      model,
      usage,
    }
    this.boundary = boundary
    const sessionId = this.deps.getSessionId()
    if (sessionId) {
      this.persistCompaction(sessionId, boundary)
    }
    this.deps.emit({
      type: "compaction_summary",
      compactionId,
      message: createCompactionSummaryMessage(summary, tokensBefore, true, model, usage),
    })
    this.emitUsage()
    return { ok: true }
  }

  // 撤销最后一次手动压缩（/undo 对压缩摘要触发）：清边界、删 compaction entry。
  // 自动压缩的边界 manual=false 不可撤销；撤销后上下文容量回到全量估计。
  async undo(): Promise<AgentUndoCompactionResult> {
    const boundary = this.boundary
    if (!boundary || !boundary.manual) {
      return { ok: false, error: "只能撤销手动触发的上下文压缩。" }
    }
    this.boundary = null
    const sessionId = this.deps.getSessionId()
    if (sessionId) {
      this.removeLastCompactionEntry(sessionId)
    }
    this.emitUsage()
    return { ok: true }
  }
}
