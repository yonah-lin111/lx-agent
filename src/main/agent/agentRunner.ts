import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import type {
  AgentCapabilitySnapshot,
  AgentEvent,
  AgentForkResult,
  AgentMessage,
  AgentRestoredSession,
  AgentSendContext,
  AgentSendResult,
  AgentSessionSummary,
  AgentSwitchWorktreeResult,
} from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import { agentSessionService, createExternalId } from "@/services/agentSessionService"
import { getDefaultCapabilities } from "@/services/capabilityService"
import { gitSnapshotService, type SnapshotFileChange } from "@/services/gitSnapshotService"
import { projectService } from "@/services/projectService"
import { getCompactionSettings } from "@/services/settingsService"
import {
  type CompactionBoundary,
  createCompactionSummaryMessage,
  estimateContextTokens,
  findCutPoint,
  generateCompactionSummary,
  isContextOverflowFailure,
} from "./compaction"
import { Agent } from "./core/agent"
import type { AgentTool } from "./core/types"
import { mcpManager, wrapMcpTool } from "./mcp/mcpManager"
import { permissionManager } from "./permissions/permissionManager"
import { createReadSkillTool } from "./skills/readSkillTool"
import {
  formatSkillsForPrompt,
  type LoadedSkill,
  skillLoader,
  stripFrontmatter,
} from "./skills/skillLoader"
import { createAiSdkStreamFn } from "./stream/aiSdkStreamFn"
import { resolveDefaultModel, resolveModelSelection } from "./stream/modelFactory"
import { generateSessionTitle } from "./titleGenerator"
import { createBashTool } from "./tools/bash"
import { createEditTool } from "./tools/edit"
import { createFindTool } from "./tools/find"
import { createGrepTool } from "./tools/grep"
import { createLsTool } from "./tools/ls"
import { createReadTool } from "./tools/read"
import { ToolRegistry } from "./tools/registry"
import { createTaskTool, type TaskToolDeps } from "./tools/task"
import { createTimeTool } from "./tools/time"
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from "./tools/truncate"
import { createWebSearchTool } from "./tools/webSearch"
import { createWriteTool } from "./tools/write"

// Agent 默认系统提示词。
const DEFAULT_SYSTEM_PROMPT = [
  "你是 LX Agent，一个帮助用户在本地项目中工作的 AI 助手。",
  "你可以使用工具读取、搜索、写入和编辑项目目录内的文件，并在项目根目录执行命令。",
  "修改文件前先读取确认目标内容；执行有副作用的命令前说明你的意图。",
  "回答使用简体中文，代码与专有名词保留原文。",
].join("\n")

// 可装配的内置工具全集（注册全集，按能力快照激活子集）。
const ALL_TOOL_NAMES = new Set([
  "read",
  "ls",
  "grep",
  "find",
  "write",
  "edit",
  "bash",
  "time",
  "web_search",
  "task",
])

// skill 注入上限（按 name 排序取前 N；描述注入时截断）。
const MAX_INJECTED_SKILLS = 50

// 解析 Agent 会话 cwd：最近更新的文件系统项目目录。
const resolveCwd = (): string | undefined => {
  const projects = projectService.listProjects()
  const filesystemProjects = projects
    .filter((project) => project.type === "filesystem" && Boolean(project.path))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return filesystemProjects[0]?.path
}

// 装配会话工具集：注册八工具全集 + task + MCP 包装工具 + read_skill，按能力集激活。
const createRegistry = (
  cwd: string,
  activeTools: string[],
  mcpToolNames: string[],
  withReadSkill: boolean,
  taskDeps?: TaskToolDeps,
): ToolRegistry => {
  const registry = new ToolRegistry(cwd)
  registry.register(createReadTool(cwd))
  registry.register(createLsTool(cwd))
  registry.register(createGrepTool(cwd))
  registry.register(createFindTool(cwd))
  registry.register(createWriteTool(cwd))
  registry.register(createEditTool(cwd))
  registry.register(createBashTool(cwd))
  registry.register(createTimeTool())
  registry.register(createWebSearchTool())
  // task 子代理工具：execute 时从注册表当前激活集派生子代理工具集（去掉 task 斩断递归）。
  if (taskDeps) {
    registry.register(
      createTaskTool({
        ...taskDeps,
        getTools: () => registry.getActive().filter((tool) => tool.name !== "task"),
      }),
    )
  }
  // MCP 工具：仅注册允许列表命中的已连接工具。
  const activeMcpNames: string[] = []
  for (const handle of mcpManager.getTools()) {
    if (mcpToolNames.includes(handle.fullName)) {
      registry.register(wrapMcpTool(handle.server, handle.def, handle.client, handle.timeout))
      activeMcpNames.push(handle.fullName)
    }
  }
  if (withReadSkill) {
    registry.register(createReadSkillTool(cwd))
  }
  // 配置可能引用未注册工具，过滤后激活。
  registry.setActive([
    ...activeTools.filter((name) => ALL_TOOL_NAMES.has(name)),
    ...activeMcpNames,
    ...(withReadSkill ? ["read_skill"] : []),
  ])
  return registry
}

// 由首条用户消息生成会话标题（空输入回退默认标题）。
const createTitle = (text: string): string => {
  const normalized = (text || "new chat").replace(/\s+/g, " ").trim().slice(0, 40)
  return normalized || "new chat"
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
  private activeCapabilities: string[] = getDefaultCapabilities().tools
  // 当前会话生效的 MCP 工具（全名）与注入 skill（随能力快照刷新）。
  private activeMcp: string[] = []
  private activeSkills: LoadedSkill[] = []
  // 最近一次装配的能力指纹；cwd/模型不变且能力未变时跳过重建。
  private builtSignature = ""
  // 上下文压缩边界：summary 替代 firstKeptSeq 之前的历史（transformContext 消费）。
  private contextBoundary: CompactionBoundary | null = null
  // 消息 → DB seq 对齐（与 agent.state.messages 下标一一对应；未落库消息为 -1 恒保留）。
  private messageSeqs: number[] = []
  // 本次 run 是否检测到 context-overflow 错误（不落库，force 压缩后自动重试一次）。
  private overflowDetected = false
  // 当前 turn 的起始快照哈希（send/continue 开始时捕获；flushTurn 落库后清空）。
  private pendingSnapshotStart: string | null = null

  // 当前 turn 的落盘输入；run 开始时捕获。
  private sessionInput: PendingSessionInput | null = null
  // 本次 run 已提交的消息（message_end 事件缓冲）。
  private runMessages: AgentMessage[] = []
  // 本次 run 的工具调用缓冲。
  private pendingCalls = new Map<string, PendingCall>()
  // run 代数：负值表示当前无活动 run（已丢弃/已结束），残留事件不再落盘。
  private currentRunGeneration = -1

  // 绑定事件转发目标（IPC 层注入 webContents 发送）。
  attachEventSink(sink: (event: AgentEvent) => void): void {
    this.eventSink = sink
  }

  // 切换当前会话 id：旧会话的权限内存态（含挂起请求）随之清理。
  private setSessionId(sessionId: string | null): void {
    if (this.currentSessionId === sessionId) return
    if (this.currentSessionId) {
      permissionManager.clearSession(this.currentSessionId)
    }
    this.currentSessionId = sessionId
  }

  // 保证 Agent 就绪；返回错误信息时表示不可用。
  private ensureReady(): { agent: Agent } | { error: string } {
    // 每次装配刷新权限配置与 MCP 门控集（设置页保存后自然生效）。
    permissionManager.load()
    permissionManager.setMcpTools(this.activeMcp)

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

    // 能力指纹：内置激活集 + MCP 工具 + 注入 skill 任一变化即重建装配。
    const capabilitiesSignature = JSON.stringify([
      this.activeCapabilities,
      this.activeMcp,
      this.activeSkills.map((skill) => skill.name),
    ])
    if (
      !this.agent ||
      !this.registry ||
      this.cwd !== cwd ||
      capabilitiesSignature !== this.builtSignature ||
      this.agent.state.model.provider !== modelResult.model.provider ||
      this.agent.state.model.id !== modelResult.model.id
    ) {
      const registry = createRegistry(
        cwd,
        this.activeCapabilities,
        this.activeMcp,
        this.activeSkills.length > 0,
        {
          systemPrompt: DEFAULT_SYSTEM_PROMPT + formatSkillsForPrompt(this.activeSkills),
          model: modelResult.model,
          beforeToolCall: (context, signal) =>
            permissionManager.gate(context, this.currentSessionId, signal),
          getSignal: () => this.agent?.signal,
        },
      )
      const previousMessages = this.agent?.state.messages ?? []
      const agent = new Agent({
        streamFn: createAiSdkStreamFn(),
        beforeToolCall: (context, signal) =>
          permissionManager.gate(context, this.currentSessionId, signal),
        // 上下文压缩：模型请求边界构造 [摘要] + 保留尾部；state.messages 保持全量（UI/DB 真相源）。
        transformContext: async (messages) => {
          const boundary = this.contextBoundary
          if (!boundary) return messages
          const kept = messages.filter(
            (_, index) => (this.messageSeqs[index] ?? -1) >= boundary.firstKeptSeq,
          )
          return [createCompactionSummaryMessage(boundary.summary, boundary.tokensBefore), ...kept]
        },
        initialState: {
          systemPrompt: DEFAULT_SYSTEM_PROMPT + formatSkillsForPrompt(this.activeSkills),
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
      this.builtSignature = capabilitiesSignature
    }

    return { agent: this.agent }
  }

  // 新会话（无当前会话）时冻结归属、cwd 与能力（全量）；既有会话忽略 context 的 binding/cwd。
  private freezeNewSession(context: AgentSendContext): void {
    if (this.currentSessionId) return
    this.sessionBinding = {
      projectItemId: context.projectItemId,
      projectId: context.projectId,
      page: context.page,
    }
    const cwd = context.cwd ?? (context.projectItemId ? resolveCwd() : homedir())
    if (cwd) this.requestedCwd = cwd
    const snapshot = getDefaultCapabilities()
    this.activeCapabilities = snapshot.tools
    this.activeMcp = this.resolveMcpTools()
    this.activeSkills = cwd ? this.resolveInjectedSkills(cwd) : []
  }

  // MCP 激活集：全量已连接工具（配置即启用，无页面裁剪）。
  private resolveMcpTools(): string[] {
    return mcpManager.getTools().map((handle) => handle.fullName)
  }

  // skill 注入清单：全部可用（disable-model-invocation 除外），排序后截断至注入上限。
  private resolveInjectedSkills(cwd: string): LoadedSkill[] {
    const available = skillLoader.load(cwd).filter((skill) => !skill.disableModelInvocation)
    return [...available].sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_INJECTED_SKILLS)
  }

  // 显式触发 /skill:<name> args → 正文块（strip frontmatter）+ args；未命中原样透传。
  private _expandSkillCommand(text: string): string {
    if (!text.startsWith("/skill:")) return text
    const spaceIndex = text.indexOf(" ")
    const skillName = spaceIndex === -1 ? text.slice(7) : text.slice(7, spaceIndex)
    const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1).trim()
    const cwd = this.cwd
    if (!cwd) return text
    const skill = skillLoader.get(skillName, cwd)
    if (!skill) return text
    const body = stripFrontmatter(readFileSync(skill.filePath, "utf8")).trim()
    const skillBlock = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`
    return args ? `${skillBlock}\n\n${args}` : skillBlock
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
    // MCP server 连接（幂等；配置空时立即返回）。
    await mcpManager.ensureConnected()
    if (context !== undefined) {
      this.freezeNewSession(context)
    }
    const ready = this.ensureReady()
    if ("error" in ready) {
      return { ok: false, error: ready.error }
    }
    const { agent } = ready
    if (agent.state.isStreaming) {
      return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
    }
    // 新会话：从空上下文开始（旧会话已在 DB 落盘，由恢复流程重建）。
    const isNewSession = !this.currentSessionId
    if (isNewSession) {
      agent.state.messages = []
      this.messageSeqs = []
      this.contextBoundary = null
      this.overflowDetected = false
    }
    // 显式 /skill: 触发在 main 侧展开正文（未命中原样透传）。
    const expanded = this._expandSkillCommand(text)
    this.beginSessionTurn(text)
    // 文件快照：turn 开始捕获 hash_start（仅 git 仓库，失败静默降级）。
    this.pendingSnapshotStart = this.captureSnapshot()
    // 新建会话：发送后立即建会话行并触发 AI 标题生成（输入只用用户消息，不等一轮输出完成）。
    if (isNewSession && this.sessionInput) {
      agentSessionService.transaction(() => {
        this.createSessionIfNeeded(this.sessionInput!, new Date().toISOString())
      })
      if (this.currentSessionId) {
        this.generateTitle(this.currentSessionId, text)
      }
    }
    try {
      await agent.prompt(expanded)
      // context-overflow 自动压缩重试一次（决策 9）：移除错误消息 → 强制压缩 → 续跑重试。
      if (this.overflowDetected) {
        this.overflowDetected = false
        this.removeLastOverflowMessage()
        const compacted = await this.compactIfNeeded(true)
        if (!compacted) {
          throw new Error("上下文超出模型窗口且自动压缩失败，请新建会话或重试。")
        }
        // 重试用 continue 而非重新 prompt：本轮 user 消息已落库，避免重复注入。
        this.beginSessionTurn(text)
        await agent.continue()
        if (this.overflowDetected) {
          this.overflowDetected = false
          this.removeLastOverflowMessage()
          throw new Error("上下文压缩后仍超出模型窗口，请新建会话或减少会话长度。")
        }
      } else {
        // 阈值压缩：turn 结束后同步执行（阻塞下一条消息数秒可接受）。
        await this.compactIfNeeded(false)
      }
    } catch (error) {
      this.discardPendingTurn()
      // 首轮 prompt 失败且会话无任何消息落库：清理刚创建的空会话。
      if (
        isNewSession &&
        this.currentSessionId &&
        !this.hasSessionMessages(this.currentSessionId)
      ) {
        agentSessionService.deleteSession(this.currentSessionId)
        this.setSessionId(null)
        this.sessionBinding = null
      }
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    if (!this.currentSessionId) {
      return { ok: false, error: "会话持久化失败。" }
    }
    return { ok: true, sessionId: this.currentSessionId }
  }

  // 继续生成：续写被截断/中止的上一轮输出（对齐 pi 后置续跑语义）。
  // 最后一条 assistant 的 stopReason ∈ {length, aborted} 时先注入可见的 user 续写指令再续跑，
  // 使被中断的输出得以续写；续写消息走既有事件流与落库（作为 user 气泡如实展示）。
  async continue(): Promise<AgentSendResult> {
    await mcpManager.ensureConnected()
    const ready = this.ensureReady()
    if ("error" in ready) {
      return { ok: false, error: ready.error }
    }
    const { agent } = ready
    if (agent.state.isStreaming) {
      return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
    }
    if (!this.currentSessionId) {
      return { ok: false, error: "没有可继续的会话。" }
    }

    const lastMessage = agent.state.messages[agent.state.messages.length - 1]
    const isInterrupted =
      lastMessage?.role === "assistant" &&
      (lastMessage.stopReason === "length" || lastMessage.stopReason === "aborted")
    if (!isInterrupted) {
      return { ok: false, error: "当前没有可继续的对话。" }
    }

    const continueText = "请继续输出刚才被中断的内容。"
    // steer 消息在下一轮 loop 前被消费，作为可见 user 气泡随事件流落库。
    agent.steer({ role: "user", content: continueText, timestamp: Date.now() })
    this.beginSessionTurn(continueText)
    // 文件快照：turn 开始捕获 hash_start（仅 git 仓库，失败静默降级）。
    this.pendingSnapshotStart = this.captureSnapshot()
    try {
      await agent.continue()
      // continue 侧不做 overflow 自动重试（续写指令已消费）；识别到则移除错误轮并返回错误。
      if (this.overflowDetected) {
        this.overflowDetected = false
        this.removeLastOverflowMessage()
        throw new Error("上下文超出模型窗口，请新建会话或重试。")
      }
      await this.compactIfNeeded(false)
    } catch (error) {
      this.discardPendingTurn()
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
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
    // 按 DB 消息 timestamp 重建 seq 对齐（未命中 = 幽灵消息，恒保留）。
    this.messageSeqs = this.syncMessageSeqs(messages)
    if (messages.length === 0) {
      this.setSessionId(null)
      this.sessionBinding = null
      this.contextBoundary = null
    }
  }

  // 恢复历史会话：从 DB 读取 entries 重建上下文、能力快照与模型；MCP/skill 按当前配置重载。
  async restoreSession(sessionId: string): Promise<AgentRestoredSession> {
    const session = agentSessionService.getSession(sessionId)
    if (!session) {
      throw new Error("SESSION_NOT_FOUND")
    }
    const { messages, seqs, capabilities } = this.readSessionEntries(sessionId)

    this.discardPendingTurn()
    this.agent?.abort()
    await mcpManager.ensureConnected()
    this.setSessionId(session.external_id)
    this.sessionBinding = {
      projectItemId: session.project_item_id ?? undefined,
      projectId: session.project_id ?? undefined,
      page: session.page ?? undefined,
    }
    // 能力全量（与新建会话一致）；MCP/skill 按当前配置重载（外部资源），快照仅展示/校验。
    this.activeCapabilities = getDefaultCapabilities().tools
    this.requestedCwd = session.cwd
    this.activeMcp = this.resolveMcpTools()
    this.activeSkills = this.resolveInjectedSkills(session.cwd)

    const ready = this.ensureReady()
    if ("error" in ready) {
      throw new Error(ready.error)
    }
    ready.agent.state.messages = [...messages]
    this.messageSeqs = seqs
    this.contextBoundary = this.readCompactionEntry(sessionId)
    // state.messages 保持全量；返回给 renderer 的消息列表插入可见摘要块（UI 位置与压缩边界一致）。
    return { messages: this.withCompactionSummary(messages), activeCapabilities: capabilities }
  }

  // 按 seq 读取会话，重建消息列表、消息 → seq 对齐与最近的能力快照。
  private readSessionEntries(sessionId: string): {
    messages: AgentMessage[]
    seqs: number[]
    capabilities: AgentCapabilitySnapshot
  } {
    const messages: AgentMessage[] = []
    const seqs: number[] = []
    let capabilities: AgentCapabilitySnapshot = { tools: [], mcp: [], skills: [] }

    for (const entry of agentSessionService.listEntries(sessionId)) {
      if (entry.type === "message") {
        try {
          messages.push(JSON.parse(entry.payload) as AgentMessage)
          seqs.push(entry.seq)
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
    return { messages, seqs, capabilities }
  }

  // 历史会话列表（全量，客户端过滤）。
  listSessions(): AgentSessionSummary[] {
    return agentSessionService.listSessions()
  }

  // 删除一轮对话：以该轮用户消息 timestamp 定位，删除用户消息 + 后续 AI/toolResult 消息及关联调用。
  // 删除后会话无剩余消息则整体删除会话（保持"空会话不入库"不变量）。
  deleteMessageTurn(sessionId: string, userMessageTimestamp: number): void {
    const parsed = agentSessionService.listMessageEntries(sessionId).map((entry) => {
      let message: AgentMessage | undefined
      try {
        message = JSON.parse(entry.payload) as AgentMessage
      } catch {
        // 损坏的 entry 跳过，不参与边界判定。
      }
      return { entry, message }
    })

    let startIndex = -1
    for (let index = 0; index < parsed.length; index++) {
      const message = parsed[index].message
      if (message?.role === "user" && message.timestamp === userMessageTimestamp) {
        startIndex = index
        break
      }
    }
    // 未命中（UI-only 幽灵轮）：无需写库。
    if (startIndex < 0) return

    const turnEntryIds: string[] = []
    for (let index = startIndex; index < parsed.length; index++) {
      const { entry, message } = parsed[index]
      // 遇到下一个用户消息即为一轮结束，不纳入本轮删除范围。
      if (index > startIndex && message?.role === "user") break
      turnEntryIds.push(entry.external_id)
    }

    // 文件快照回滚：仅当被删轮是最后一条用户消息轮时回滚文件（中段轮删除维持只删消息，
    // 避免与后续轮引用/修改的文件状态冲突；完整 revert-and-cleanup 留 v2）。
    let isLastUserTurn = true
    for (let index = startIndex + 1; index < parsed.length; index++) {
      if (parsed[index].message?.role === "user") {
        isLastUserTurn = false
        break
      }
    }
    if (isLastUserTurn) {
      this.revertTurnFiles(sessionId, userMessageTimestamp)
    }

    const now = new Date().toISOString()
    agentSessionService.transaction(() => {
      agentSessionService.deleteCallsByEntryIds(turnEntryIds)
      agentSessionService.deleteEntries(turnEntryIds)
      // 该轮快照随消息一并清理（回滚已完成，快照不再有效）。
      agentSessionService.deleteSnapshotsByUserTimestamp(sessionId, userMessageTimestamp)
      if (agentSessionService.listMessageEntries(sessionId).length === 0) {
        agentSessionService.deleteSessionRow(sessionId)
        if (this.currentSessionId === sessionId) {
          this.setSessionId(null)
          this.sessionBinding = null
        }
      } else {
        agentSessionService.touchSession(sessionId, now)
      }
    })
  }

  // 重命名会话标题（仅当会话存在）。
  renameSession(sessionId: string, title: string): void {
    if (!agentSessionService.getSession(sessionId)) return
    agentSessionService.renameSession(sessionId, title, new Date().toISOString())
  }

  // 会话分支：从指定用户轮（timestamp 定位）切割复制历史到新会话，返回新会话 id。
  // busy（流式/挂起权限请求）拒绝；切割点在已压缩区域（< firstKeptSeq）拒绝。
  forkSession(sessionId: string, userMessageTimestamp?: number): AgentForkResult {
    if (this.agent?.state.isStreaming) {
      return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
    }
    if (!agentSessionService.getSession(sessionId)) {
      return { ok: false, error: "会话不存在。" }
    }
    // 切割点定位：timestamp → 用户消息 entry seq（未命中 = UI 幽灵轮）。
    let forkSeq: number | undefined
    if (userMessageTimestamp !== undefined) {
      const forkEntry = agentSessionService.listMessageEntries(sessionId).find((entry) => {
        try {
          const message = JSON.parse(entry.payload) as AgentMessage
          return message.role === "user" && message.timestamp === userMessageTimestamp
        } catch {
          return false
        }
      })
      if (!forkEntry) {
        return { ok: false, error: "未找到该轮用户消息。" }
      }
      forkSeq = forkEntry.seq
      // 切割点在已压缩区域：拒绝（对齐 pi invalid_fork_target 拒绝语义）。
      const boundary = this.readCompactionEntry(sessionId)
      if (boundary && forkSeq < boundary.firstKeptSeq) {
        return {
          ok: false,
          error: "该轮位于已压缩区域，无法从此分支。请选择压缩摘要之后的消息。",
        }
      }
    }
    const result = agentSessionService.forkSession(sessionId, forkSeq)
    if (!result.ok) return result
    return { ok: true, sessionId: result.session.id }
  }

  // 切换当前会话工作区（/gitWorktree）：streaming 中拒绝；更新装配目标并持久化会话 cwd。
  // 已落库会话直接改 cwd；空白新会话仅更新 requestedCwd（下次 send 创建会话时生效）。
  // 下次 send 的 ensureReady 检测到 cwd 变化后按新目录重建工具集与 skill 注入。
  switchWorktree(path: string): AgentSwitchWorktreeResult {
    if (this.agent?.state.isStreaming) {
      return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
    }
    this.requestedCwd = path
    if (this.currentSessionId) {
      agentSessionService.updateSessionCwd(this.currentSessionId, path, new Date().toISOString())
    }
    return { ok: true }
  }

  // 删除整个会话（含消息与调用）；若是当前会话则脱离，避免残留事件写入已删会话。
  deleteSession(sessionId: string): void {
    this.discardPendingTurn()
    this.agent?.abort()
    if (this.currentSessionId === sessionId) {
      this.setSessionId(null)
      this.sessionBinding = null
    }
    agentSessionService.deleteSession(sessionId)
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
    this.sessionInput = {
      binding: this.sessionBinding ?? {},
      cwd: this.cwd ?? "",
      title: createTitle(text),
      capabilities: {
        tools: [...this.activeCapabilities],
        mcp: [...this.activeMcp],
        skills: this.activeSkills.map((skill) => skill.name),
      },
    }
  }

  // 丢弃未落盘的 turn（恢复/新建/失败时调用；残留事件不再落盘）。
  private discardPendingTurn(): void {
    this.sessionInput = null
    this.runMessages = []
    this.pendingCalls.clear()
    this.currentRunGeneration = -1
    this.pendingSnapshotStart = null
  }

  // Agent 事件 → 持久化缓冲（转发渲染的事件由调用方处理）。
  private handleEvent(event: AgentEvent): void {
    if (this.currentRunGeneration < 0) return
    switch (event.type) {
      case "message_end":
        // context-overflow 错误轮不落库：标记后由 send 自动压缩重试，避免污染真相源。
        if (this.isOverflowFailure(event.message)) {
          this.overflowDetected = true
        } else {
          this.runMessages.push(event.message)
        }
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

  // 会话不存在时创建会话行 + 能力快照；已存在则直接返回（须在事务内调用）。
  private createSessionIfNeeded(input: PendingSessionInput, now: string): string {
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
      this.setSessionId(sessionId)
      this.sessionBinding = input.binding
    }
    return sessionId
  }

  // 会话是否已落库消息（首轮 prompt 失败清理空会话判定）。
  private hasSessionMessages(sessionId: string): boolean {
    return agentSessionService.listMessageEntries(sessionId).length > 0
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

    if (!input || messages.length === 0) {
      this.pendingSnapshotStart = null
      return
    }

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

    // 文件快照：git 操作（add/write-tree/diff）放事务外，避免阻塞 DB 事务。
    const snapshotRecord = this.computeSnapshotRecord(messages)

    agentSessionService.transaction(() => {
      const sessionId = this.createSessionIfNeeded(input, now)

      let seq = agentSessionService.nextSeq(sessionId)
      const appendedSeqs: number[] = []
      for (const entry of entries) {
        agentSessionService.insertEntry({
          externalId: entry.externalId,
          sessionId,
          seq,
          type: entry.type,
          payload: entry.payload,
          createdAt: now,
        })
        appendedSeqs.push(seq)
        seq += 1
      }

      for (const call of calls) {
        const finishedAt = call.finishedAt
        agentSessionService.insertCall({
          sessionId,
          externalId: createExternalId(),
          entryId: entryIdByToolCallId.get(call.toolCallId) ?? null,
          parentCallId: null,
          // task 调用落 kind=subagent（子代理内部工具 v1 不单独落库）。
          kind: call.toolName === "task" ? "subagent" : "builtin",
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
      // 本轮消息 seq 追加到对齐数组（与 agent.state.messages 尾部对应）。
      this.messageSeqs.push(...appendedSeqs)
      // 本轮文件快照（hash_start → hash_end + 变更列表）。
      if (snapshotRecord) {
        agentSessionService.insertSnapshot({
          externalId: createExternalId(),
          sessionId,
          userMessageTimestamp: snapshotRecord.userMessageTimestamp,
          hashStart: snapshotRecord.hashStart,
          hashEnd: snapshotRecord.hashEnd,
          filesChanged: JSON.stringify(snapshotRecord.changes),
          createdAt: now,
        })
      }
    })
  }

  // turn 起始快照：cwd 是 git 仓库才返回 tree hash，否则 null（静默降级）。
  private captureSnapshot(): string | null {
    if (!this.cwd) return null
    return gitSnapshotService.capture(this.cwd)
  }

  // 计算本轮快照记录：hash_end + 变更列表；无变更/非 git 返回 null（并清理起始哈希）。
  private computeSnapshotRecord(messages: AgentMessage[]): {
    userMessageTimestamp: number
    hashStart: string
    hashEnd: string
    changes: SnapshotFileChange[]
  } | null {
    const hashStart = this.pendingSnapshotStart
    this.pendingSnapshotStart = null
    if (!hashStart || !this.cwd) return null
    const hashEnd = gitSnapshotService.capture(this.cwd)
    if (!hashEnd || hashEnd === hashStart) return null
    const changes = gitSnapshotService.diff(hashStart, hashEnd, this.cwd)
    const userTimestamp = messages.find((message) => message.role === "user")?.timestamp
    if (changes.length === 0 || userTimestamp === undefined) return null
    return { userMessageTimestamp: userTimestamp, hashStart, hashEnd, changes }
  }

  // 回滚一轮的文件改动（仅当被删轮是最后一条用户消息轮；git 仓库才生效）。
  private revertTurnFiles(sessionId: string, userMessageTimestamp: number): void {
    const session = agentSessionService.getSession(sessionId)
    if (!session) return
    const snapshot = agentSessionService.getSnapshotByUserTimestamp(sessionId, userMessageTimestamp)
    if (!snapshot) return
    try {
      const changes = JSON.parse(snapshot.files_changed) as SnapshotFileChange[]
      gitSnapshotService.revert(session.cwd, snapshot.hash_start, changes)
    } catch {
      // 快照损坏回滚失败：静默，仅删消息（尽力而为）。
    }
  }

  // 判断是否 context-overflow 错误轮（不落库，自动压缩重试）。
  private isOverflowFailure(message: AgentMessage): boolean {
    return (
      message.role === "assistant" &&
      message.stopReason === "error" &&
      isContextOverflowFailure(message.errorMessage ?? "")
    )
  }

  // 从 state.messages 尾部移除 overflow 错误消息（消息未落库，messageSeqs 无对应项）。
  private removeLastOverflowMessage(): void {
    const messages = this.agent?.state.messages
    if (!messages) return
    while (messages.length > 0 && this.isOverflowFailure(messages[messages.length - 1])) {
      messages.pop()
    }
  }

  // 按 DB 消息 timestamp 重建 seq 对齐（restoreMessages 用；未命中 = 幽灵消息，恒保留 -1）。
  private syncMessageSeqs(messages: AgentMessage[]): number[] {
    const seqByTimestamp = new Map<number, number>()
    const sessionId = this.currentSessionId
    if (sessionId) {
      for (const entry of agentSessionService.listEntries(sessionId)) {
        if (entry.type !== "message") continue
        try {
          const message = JSON.parse(entry.payload) as AgentMessage
          if (typeof message.timestamp === "number" && !seqByTimestamp.has(message.timestamp)) {
            seqByTimestamp.set(message.timestamp, entry.seq)
          }
        } catch {
          // 损坏 entry 跳过。
        }
      }
    }
    return messages.map((message) =>
      typeof message.timestamp === "number" ? (seqByTimestamp.get(message.timestamp) ?? -1) : -1,
    )
  }

  // 读取会话最近的 compaction entry，重建压缩边界（无则 null）。
  private readCompactionEntry(sessionId: string): CompactionBoundary | null {
    for (const entry of agentSessionService.listEntries(sessionId)) {
      if (entry.type !== "compaction") continue
      try {
        const parsed = JSON.parse(entry.payload) as Partial<CompactionBoundary>
        if (
          typeof parsed.summary === "string" &&
          typeof parsed.firstKeptSeq === "number" &&
          typeof parsed.tokensBefore === "number"
        ) {
          return parsed as CompactionBoundary
        }
      } catch {
        // 损坏 entry 跳过。
      }
    }
    return null
  }

  // 在返回给 renderer 的消息列表中，于压缩边界处插入可见摘要块（UI 展示全量历史 + 摘要）。
  private withCompactionSummary(messages: AgentMessage[]): AgentMessage[] {
    const boundary = this.contextBoundary
    if (!boundary) return messages
    const summary = createCompactionSummaryMessage(boundary.summary, boundary.tokensBefore)
    const insertIndex = messages.findIndex(
      (_, index) => (this.messageSeqs[index] ?? -1) >= boundary.firstKeptSeq,
    )
    if (insertIndex < 0) return [summary, ...messages]
    return [...messages.slice(0, insertIndex), summary, ...messages.slice(insertIndex)]
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

  // turn 结束后压缩：估计上下文 token 超阈值（或 overflow 强制）时，摘要化早期历史并建立新边界。
  // 返回是否实际压缩；摘要生成失败静默保留旧边界（下轮再试）。
  private async compactIfNeeded(force: boolean): Promise<boolean> {
    const config = getCompactionSettings()
    if (!config.enabled) return false
    const agent = this.agent
    if (!agent) return false
    const messages = agent.state.messages
    if (messages.length === 0) return false
    if (!force) {
      const estimated = estimateContextTokens(messages)
      if (estimated <= config.contextWindow - config.reserveTokens) return false
    }
    const cutIndex = findCutPoint(messages, config.keepRecentTokens)
    // 全部保留或压缩无收益（保留起点 ≤ 1）时不压缩。
    if (cutIndex >= messages.length || cutIndex <= 1) return false
    const compacted = messages.slice(0, cutIndex)
    const summary = await generateCompactionSummary(compacted)
    if (!summary) return false
    const tokensBefore = estimateContextTokens(compacted)
    const boundary: CompactionBoundary = {
      summary,
      firstKeptSeq: this.messageSeqs[cutIndex] ?? -1,
      tokensBefore,
    }
    this.contextBoundary = boundary
    if (this.currentSessionId) {
      this.persistCompaction(this.currentSessionId, boundary)
    }
    // 推送可见摘要消息（renderer 插入为非交互块；不落 message entry）。
    this.eventSink?.({
      type: "compaction_summary",
      message: createCompactionSummaryMessage(summary, tokensBefore),
    })
    return true
  }

  // 标题生成：先推 pending 占位，成功/失败均回填 done 事件；写库前校验仍为当前会话。
  private generateTitle(sessionId: string, userText: string): void {
    this.eventSink?.({ type: "session_title", sessionId, title: null })
    void generateSessionTitle([{ role: "user", content: userText, timestamp: Date.now() }]).then(
      (generated) => {
        const session = agentSessionService.getSession(sessionId)
        if (!session) return
        let title = session.title
        if (generated && this.currentSessionId === sessionId) {
          agentSessionService.renameSession(sessionId, generated, new Date().toISOString())
          title = generated
        }
        this.eventSink?.({ type: "session_title", sessionId, title })
      },
    )
  }
}

// AgentRunner 单例。
export const agentRunner = new AgentRunner()
