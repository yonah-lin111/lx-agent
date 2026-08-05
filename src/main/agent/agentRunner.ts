import { homedir } from "node:os"
import type {
  AgentCapabilitySnapshot,
  AgentEvent,
  AgentMessage,
  AgentRestoredSession,
  AgentSendContext,
  AgentSendResult,
  AgentSessionFilter,
  AgentSessionSummary,
} from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import { agentSessionService, createExternalId } from "@/services/agentSessionService"
import { getItemCapabilities, getPageCapabilities } from "@/services/capabilityService"
import { projectService } from "@/services/projectService"
import { Agent } from "./core/agent"
import type { AgentTool } from "./core/types"
import { createAiSdkStreamFn } from "./stream/aiSdkStreamFn"
import { resolveDefaultModel, resolveModelSelection } from "./stream/modelFactory"
import { createBashTool } from "./tools/bash"
import { createEditTool } from "./tools/edit"
import { createFindTool } from "./tools/find"
import { createGrepTool } from "./tools/grep"
import { createLsTool } from "./tools/ls"
import { createReadTool } from "./tools/read"
import { ToolRegistry } from "./tools/registry"
import { createTimeTool } from "./tools/time"
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from "./tools/truncate"
import { createWriteTool } from "./tools/write"

// Agent 默认系统提示词。
const DEFAULT_SYSTEM_PROMPT = [
  "你是 LX Agent，一个帮助用户在本地项目中工作的 AI 助手。",
  "你可以使用工具读取、搜索、写入和编辑项目目录内的文件，并在项目根目录执行命令。",
  "修改文件前先读取确认目标内容；执行有副作用的命令前说明你的意图。",
  "回答使用简体中文，代码与专有名词保留原文。",
].join("\n")

// 可装配的内置工具全集（注册全集，按能力快照激活子集）。
const ALL_TOOL_NAMES = new Set(["read", "ls", "grep", "find", "write", "edit", "bash", "time"])

// 解析 Agent 会话 cwd：最近更新的文件系统项目目录。
const resolveCwd = (): string | undefined => {
  const projects = projectService.listProjects()
  const filesystemProjects = projects
    .filter((project) => project.type === "filesystem" && Boolean(project.path))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return filesystemProjects[0]?.path
}

// 装配会话工具集：注册八工具全集，按能力快照激活。
const createRegistry = (cwd: string, activeTools: string[]): ToolRegistry => {
  const registry = new ToolRegistry(cwd)
  registry.register(createReadTool(cwd))
  registry.register(createLsTool(cwd))
  registry.register(createGrepTool(cwd))
  registry.register(createFindTool(cwd))
  registry.register(createWriteTool(cwd))
  registry.register(createEditTool(cwd))
  registry.register(createBashTool(cwd))
  registry.register(createTimeTool())
  // 配置可能引用未注册工具，过滤后激活。
  registry.setActive(activeTools.filter((name) => ALL_TOOL_NAMES.has(name)))
  return registry
}

// 由首条用户消息生成会话标题（对齐 renderer chatHistoryStore.createTitle）。
const createTitle = (text: string): string => {
  const normalized = (text || "新对话").replace(/\s+/g, " ").trim().slice(0, 40)
  return normalized || "新对话"
}

// 查询视图落盘截断（复用 truncate.ts 常量）。
const truncateForStore = (value: unknown): string | null => {
  if (value === undefined || value === null) return null
  try {
    return truncateHead(JSON.stringify(value), {
      maxLines: DEFAULT_MAX_LINES,
      maxBytes: DEFAULT_MAX_BYTES,
    }).content
  } catch {
    return null
  }
}

// 待落盘的调用记录（tool 事件缓冲）。
type PendingCall = {
  toolCallId: string
  toolName: string
  args: string | null
  status: "running" | "success" | "error" | "aborted"
  result: string | null
  startedAt: number
  finishedAt: number | null
}

// 会话归属上下文。
type SessionBinding = { projectItemId?: string; projectId?: string; page?: string }

// 当前 turn 的落盘输入（run 开始时捕获，agent_end 事务内消费）。
type PendingSessionInput = {
  binding: SessionBinding
  cwd: string
  title: string
  capabilities: AgentCapabilitySnapshot
}

/**
 * 会话级 Agent 装配：持有 Agent 实例与工具注册表，将事件转发给 IPC 层。
 *
 * Agent 实例跨 send 持久（保留会话上下文）；cwd 或模型配置变化时重建工具集与模型。
 * 持久化策略：turn 内消息/调用缓冲，agent_end 时一个事务落库（会话首次落库时连带能力快照）。
 */
class AgentRunner {
  private agent?: Agent
  private registry?: ToolRegistry
  private cwd?: string
  private unsubscribe?: () => void
  private eventSink?: (event: AgentEvent) => void
  // renderer 最近一次请求的模型选择；未设置时回退到默认模型。
  private requestedModel?: ModelSelection
  // renderer 最近一次请求的项目目录；未设置时回退到最近更新的文件系统项目。
  private requestedCwd?: string

  // 当前落库会话与归属（null = 尚未建立/已脱离）。
  private currentSessionId: string | null = null
  private sessionBinding: SessionBinding | null = null
  // 当前会话的能力快照（激活工具集；随会话冻结）。
  private activeCapabilities: string[] = getItemCapabilities().tools

  // 当前 turn 的落盘输入；run 开始时捕获。
  private sessionInput: PendingSessionInput | null = null
  // 本次 run 已提交的消息（message_end 事件缓冲）。
  private runMessages: AgentMessage[] = []
  // 本次 run 的工具调用缓冲。
  private pendingCalls = new Map<string, PendingCall>()
  // run 代数：负值表示当前无活动 run（已丢弃/已结束），残留事件不再落盘。
  private currentRunGeneration = -1
  // 本次 send 是否切换到新会话（需要清空上下文并重建会话）。
  private bindingChanged = false
  // 本次 send 的归属目标（prepareBinding 捕获，beginSessionTurn 消费）。
  private targetBinding: SessionBinding | null = null

  // 绑定事件转发目标（IPC 层注入 webContents 发送）。
  attachEventSink(sink: (event: AgentEvent) => void): void {
    this.eventSink = sink
  }

  // 保证 Agent 就绪；返回错误信息时表示不可用。
  private ensureReady(): { agent: Agent } | { error: string } {
    const cwd = this.requestedCwd ?? resolveCwd()
    if (!cwd) {
      return { error: "未找到可用的项目目录。请先在项目管理中创建并绑定文件系统项目。" }
    }

    const modelResult = this.requestedModel
      ? resolveModelSelection(this.requestedModel)
      : resolveDefaultModel()
    if ("error" in modelResult) {
      return { error: modelResult.error }
    }

    if (
      !this.agent ||
      !this.registry ||
      this.cwd !== cwd ||
      this.agent.state.model.provider !== modelResult.model.provider ||
      this.agent.state.model.id !== modelResult.model.id
    ) {
      const registry = createRegistry(cwd, this.activeCapabilities)
      const previousMessages = this.agent?.state.messages ?? []
      const agent = new Agent({
        streamFn: createAiSdkStreamFn(),
        initialState: {
          systemPrompt: DEFAULT_SYSTEM_PROMPT,
          model: modelResult.model,
          tools: registry.getActive(),
        },
      })
      agent.state.messages = previousMessages
      if (this.unsubscribe) {
        this.unsubscribe()
      }
      this.unsubscribe = agent.subscribe((event) => {
        this.handleEvent(event)
        this.eventSink?.(event)
      })
      this.agent = agent
      this.registry = registry
      this.cwd = cwd
    }

    return { agent: this.agent }
  }

  // 归属上下文 → 绑定对象。
  private bindingFromContext(context: AgentSendContext): SessionBinding {
    return {
      projectItemId: context.projectItemId,
      projectId: context.projectId,
      page: context.page,
    }
  }

  private isSameBinding(a: SessionBinding | null, b: SessionBinding | null): boolean {
    if (!a || !b) return false
    return a.projectItemId === b.projectItemId && a.page === b.page
  }

  // 解析绑定下的默认能力快照：item 会话 = 内置全集；页面会话 = config 或最小只读集。
  private resolveCapabilities(binding: SessionBinding): AgentCapabilitySnapshot {
    if (binding.projectItemId) return getItemCapabilities()
    return getPageCapabilities(binding.page ?? "/")
  }

  // 绑定变化时切换会话：解析能力快照与 cwd，标记清空上下文。
  private prepareBinding(context: AgentSendContext): void {
    const binding = this.bindingFromContext(context)
    const changed = !this.currentSessionId || !this.isSameBinding(this.sessionBinding, binding)
    this.targetBinding = binding
    if (changed) {
      this.activeCapabilities = this.resolveCapabilities(binding).tools
      const cwd = context.cwd ?? (binding.projectItemId ? resolveCwd() : homedir())
      if (cwd) this.requestedCwd = cwd
    }
    this.bindingChanged = changed
  }

  // 发送一条用户消息并驱动 Agent 运行。
  async send(
    text: string,
    selection?: ModelSelection,
    context?: AgentSendContext,
  ): Promise<AgentSendResult> {
    if (selection !== undefined) {
      this.requestedModel = selection
    }
    if (context !== undefined) {
      this.prepareBinding(context)
    }
    const ready = this.ensureReady()
    if ("error" in ready) {
      return { ok: false, error: ready.error }
    }
    const { agent } = ready
    if (agent.state.isStreaming) {
      return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
    }
    // 切换到新会话：从空上下文开始（旧会话已在 DB 落盘，由恢复流程重建）。
    if (this.bindingChanged) {
      agent.state.messages = []
    }
    this.beginSessionTurn(text)
    try {
      await agent.prompt(text)
    } catch (error) {
      this.discardPendingTurn()
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    if (!this.currentSessionId) {
      return { ok: false, error: "会话持久化失败。" }
    }
    return { ok: true, sessionId: this.currentSessionId }
  }

  // 中止当前 run。
  abort(): void {
    this.agent?.abort()
  }

  // 恢复会话上下文（renderer 新建对话/撤销时调用；空消息 = 脱离当前会话）。
  restoreMessages(messages: AgentMessage[]): void {
    this.discardPendingTurn()
    this.agent?.abort()
    const ready = this.ensureReady()
    if ("error" in ready) return
    ready.agent.state.messages = [...messages]
    if (messages.length === 0) {
      this.currentSessionId = null
      this.sessionBinding = null
    }
  }

  // 恢复历史会话：从 DB 读取 entries 重建上下文、能力快照与模型。
  restoreSession(sessionId: string): AgentRestoredSession {
    const session = agentSessionService.getSession(sessionId)
    if (!session) {
      throw new Error("SESSION_NOT_FOUND")
    }
    const { messages, capabilities } = this.readSessionEntries(sessionId)

    this.discardPendingTurn()
    this.agent?.abort()
    this.currentSessionId = session.external_id
    this.sessionBinding = {
      projectItemId: session.project_item_id ?? undefined,
      projectId: session.project_id ?? undefined,
      page: session.page ?? undefined,
    }
    this.activeCapabilities = capabilities.tools
    this.requestedCwd = session.cwd

    const ready = this.ensureReady()
    if ("error" in ready) {
      throw new Error(ready.error)
    }
    ready.agent.state.messages = [...messages]
    return { messages, activeCapabilities: capabilities }
  }

  // 按 seq 读取会话，重建消息列表与最近的能力快照。
  private readSessionEntries(sessionId: string): {
    messages: AgentMessage[]
    capabilities: AgentCapabilitySnapshot
  } {
    const messages: AgentMessage[] = []
    let capabilities: AgentCapabilitySnapshot = { tools: [], mcp: [], skills: [] }

    for (const entry of agentSessionService.listEntries(sessionId)) {
      if (entry.type === "message") {
        try {
          messages.push(JSON.parse(entry.payload) as AgentMessage)
        } catch {
          // 损坏的 message entry 跳过，不阻断恢复。
        }
      } else if (entry.type === "active_capabilities") {
        const parsed = JSON.parse(entry.payload) as Partial<AgentCapabilitySnapshot>
        capabilities = {
          tools: Array.isArray(parsed.tools) ? parsed.tools : [],
          mcp: Array.isArray(parsed.mcp) ? parsed.mcp : [],
          skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        }
      }
    }
    return { messages, capabilities }
  }

  // 历史会话列表。
  listSessions(filter?: AgentSessionFilter): AgentSessionSummary[] {
    return agentSessionService.listSessions(filter ?? {})
  }

  // 当前会话上下文。
  getMessages(): AgentMessage[] {
    return this.agent?.state.messages ?? []
  }

  // 当前会话使用的工具列表。
  getActiveTools(): AgentTool<any>[] {
    return this.registry?.getActive() ?? []
  }

  // run 开始：重置缓冲并捕获本次落盘输入。
  private beginSessionTurn(text: string): void {
    this.currentRunGeneration += 1
    this.runMessages = []
    this.pendingCalls.clear()
    if (this.bindingChanged) {
      this.currentSessionId = null
      this.sessionBinding = null
      this.bindingChanged = false
    }
    this.sessionInput = {
      binding: this.targetBinding ?? this.sessionBinding ?? {},
      cwd: this.cwd ?? "",
      title: createTitle(text),
      capabilities: { tools: [...this.activeCapabilities], mcp: [], skills: [] },
    }
  }

  // 丢弃未落盘的 turn（恢复/新建/失败时调用；残留事件不再落盘）。
  private discardPendingTurn(): void {
    this.sessionInput = null
    this.runMessages = []
    this.pendingCalls.clear()
    this.currentRunGeneration = -1
  }

  // Agent 事件 → 持久化缓冲（转发渲染的事件由调用方处理）。
  private handleEvent(event: AgentEvent): void {
    if (this.currentRunGeneration < 0) return
    switch (event.type) {
      case "message_end":
        this.runMessages.push(event.message)
        break

      case "tool_execution_start":
        this.pendingCalls.set(event.toolCallId, {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: truncateForStore(event.args),
          status: "running",
          result: null,
          startedAt: Date.now(),
          finishedAt: null,
        })
        break

      case "tool_execution_end": {
        const call = this.pendingCalls.get(event.toolCallId)
        if (call) {
          call.status = event.isError ? "error" : "success"
          call.result = truncateForStore(event.result)
          call.finishedAt = Date.now()
        }
        break
      }

      case "agent_end":
        this.flushTurn()
        break
    }
  }

  // 一个 turn 落库：会话创建（含能力/模型快照）+ 消息 entries + 调用记录，一个事务。
  private flushTurn(): void {
    const input = this.sessionInput
    const messages = this.runMessages
    const calls = [...this.pendingCalls.values()]
    this.sessionInput = null
    this.runMessages = []
    this.pendingCalls.clear()
    this.currentRunGeneration = -1

    if (!input || messages.length === 0) return

    const now = new Date().toISOString()
    const entries = messages.map((message) => ({
      externalId: createExternalId(),
      type: "message",
      payload: JSON.stringify(message),
    }))
    // 工具调用 → 触发它的 assistant message entry（双向互跳）。
    const entryIdByToolCallId = new Map<string, string>()
    messages.forEach((message, index) => {
      if (message.role !== "assistant") return
      for (const block of message.content) {
        if (block.type === "toolCall") {
          entryIdByToolCallId.set(block.id, entries[index]!.externalId)
        }
      }
    })

    agentSessionService.transaction(() => {
      let sessionId = this.currentSessionId
      if (!sessionId) {
        sessionId = createExternalId()
        agentSessionService.insertSession({
          externalId: sessionId,
          projectItemId: input.binding.projectItemId ?? null,
          projectId: input.binding.projectId ?? null,
          page: input.binding.page ?? null,
          title: input.title,
          cwd: input.cwd,
          createdAt: now,
          updatedAt: now,
        })
        let seq = agentSessionService.nextSeq(sessionId)
        agentSessionService.insertEntry({
          externalId: createExternalId(),
          sessionId,
          seq: seq++,
          type: "active_capabilities",
          payload: JSON.stringify(input.capabilities),
          createdAt: now,
        })
        this.currentSessionId = sessionId
        this.sessionBinding = input.binding
      }

      let seq = agentSessionService.nextSeq(sessionId)
      for (const entry of entries) {
        agentSessionService.insertEntry({
          externalId: entry.externalId,
          sessionId,
          seq: seq++,
          type: entry.type,
          payload: entry.payload,
          createdAt: now,
        })
      }

      for (const call of calls) {
        const finishedAt = call.finishedAt
        agentSessionService.insertCall({
          sessionId,
          externalId: createExternalId(),
          entryId: entryIdByToolCallId.get(call.toolCallId) ?? null,
          parentCallId: null,
          kind: "builtin",
          name: call.toolName,
          mcpServer: null,
          status: call.status,
          args: call.args,
          result: call.result,
          durationMs: finishedAt !== null ? finishedAt - call.startedAt : null,
          startedAt: new Date(call.startedAt).toISOString(),
          finishedAt: finishedAt !== null ? new Date(finishedAt).toISOString() : null,
          createdAt: now,
          updatedAt: now,
        })
      }

      agentSessionService.touchSession(sessionId, now)
    })
  }
}

// AgentRunner 单例。
export const agentRunner = new AgentRunner()
