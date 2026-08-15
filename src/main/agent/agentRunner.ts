import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type {
  AgentCapabilitySnapshot,
  AgentCompactResult,
  AgentContextUsage,
  AgentEvent,
  AgentForkResult,
  AgentMessage,
  AgentRestoredSession,
  AgentSendContext,
  AgentSendResult,
  AgentSessionSummary,
  AgentSwitchWorktreeResult,
  AgentUndoCompactionResult,
  TodoList,
  TodoStateMessage,
} from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import {
  type AgentCallKind,
  agentSessionService,
  createExternalId,
} from "@/services/agentSessionService"
import { getDefaultCapabilities } from "@/services/capabilityService"
import { gitSnapshotService, type SnapshotFileChange } from "@/services/gitSnapshotService"
import { projectService } from "@/services/projectService"
import { getCompactionSettings, getModelProviderSettings } from "@/services/settingsService"
import {
  type CompactionBoundary,
  createCompactionSummaryMessage,
  estimateCompactedContextTokens,
  estimateContextTokens,
  findCutPoint,
  generateCompactionSummary,
  isContextOverflowFailure,
} from "./compaction"
import { Agent } from "./core/agent"
import type { AgentTool } from "./core/types"
import { formatInstructions, loadInstructions } from "./instructionLoader"
import { lspManager } from "./lsp/lspManager"
import { mcpManager, wrapMcpTool } from "./mcp/mcpManager"
import { permissionManager } from "./permissions/permissionManager"
import { questionManager } from "./question/questionManager"
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
import { createLspTool, type LspToolDeps } from "./tools/lsp"
import { createQuestionTool, type QuestionToolDeps } from "./tools/question"
import { createReadTool } from "./tools/read"
import { ToolRegistry } from "./tools/registry"
import { type ChildCallInput, createTaskTool, type TaskToolDeps } from "./tools/task"
import { createTimeTool } from "./tools/time"
import { createTodoTool } from "./tools/todowrite"
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from "./tools/truncate"
import { createWebFetchTool } from "./tools/webfetch"
import { createWebSearchTool } from "./tools/webSearch"
import { createWriteTool } from "./tools/write"

// Agent 默认系统提示词。
const DEFAULT_SYSTEM_PROMPT = [
  "你是 LX Agent，一个帮助用户在本地项目中工作的 AI 助手。",
  "你可以使用工具读取、搜索、写入和编辑项目目录内的文件，并在项目根目录执行命令。",
  "修改文件前先读取确认目标内容；执行有副作用的命令前说明你的意图。",
  "回答使用简体中文，代码与专有名词保留原文。",
  "面对多步骤任务（≥2 步、需要工具调用）时，用 todowrite 工具建立任务清单，并随进度更新；单步任务或闲聊不需要。",
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
  "todowrite",
  "web_search",
  "webfetch",
  "task",
  "question",
  "lsp",
])

// skill 注入上限（按 name 排序取前 N；描述注入时截断）。
const MAX_INJECTED_SKILLS = 50

// 排队消息上限（流式中入队；超限明确报错，不覆盖、不静默丢）。
const MAX_QUEUE = 20

// 解析 Agent 会话 cwd：最近更新的文件系统项目目录。
const resolveCwd = (): string | undefined => {
  const projects = projectService.listProjects()
  const filesystemProjects = projects
    .filter((project) => project.type === "filesystem" && Boolean(project.path))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return filesystemProjects[0]?.path
}

// 装配会话工具集：注册内置工具全集 + task + MCP 包装工具 + read_skill + lsp，按能力集激活。
const createRegistry = (
  cwd: string,
  activeTools: string[],
  mcpToolNames: string[],
  withReadSkill: boolean,
  taskDeps?: TaskToolDeps,
  questionDeps?: QuestionToolDeps,
  lspDeps?: LspToolDeps,
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
  registry.register(createTodoTool())
  registry.register(createWebSearchTool())
  registry.register(createWebFetchTool())
  if (lspDeps) {
    registry.register(createLspTool(lspDeps))
  }
  if (questionDeps) {
    registry.register(createQuestionTool(questionDeps))
  }
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

// 构造任务清单状态消息（transformContext 注入；不进 state.messages）。
const createTodoStateMessage = (todos: TodoList): TodoStateMessage => ({
  role: "todoState",
  todos,
  timestamp: Date.now(),
})

// 待落盘的调用记录（tool 事件缓冲）。
type PendingCall = {
  toolCallId: string
  // 落库 external_id：tool_execution_start 预生成，供子代理内部调用引用（parent_call_id）。
  externalId: string
  toolName: string
  args: string | null
  status: "running" | "success" | "error" | "aborted"
  result: string | null
  startedAt: number
  finishedAt: number | null
  // 子代理 provenance：触发本调用的父 task 调用行 external_id（普通调用为 null）。
  parentCallId: string | null
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
  // MCP 工具全名 → server 名反查（agent_call 落库 mcp_server 用；随装配刷新）。
  private mcpServerByToolName = new Map<string, string>()
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
  // 子代理内部工具调用缓冲（provenance：parent_call_id 指向父 task 调用行；随父 turn 落库）。
  private pendingChildCalls = new Map<string, PendingCall>()
  // 任务清单：当前生效（transformContext 注入）；pendingTodo 为本轮待落库的整表快照。
  private todoList: TodoList = []
  private pendingTodo: TodoList | null = null
  // run 代数：负值表示当前无活动 run（已丢弃/已结束），残留事件不再落盘。
  private currentRunGeneration = -1
  // 流式输出期间排队待发的消息（FIFO，内存态不落库；当前 run 结束后逐条自动发送）。
  private messageQueue: string[] = []
  // 队列是否正在被 drain 循环处理（防重入；drain 期间新 send 一律入队保持 FIFO）。
  private draining = false

  // 绑定事件转发目标（IPC 层注入 webContents 发送）。
  attachEventSink(sink: (event: AgentEvent) => void): void {
    this.eventSink = sink
  }

  // 切换当前会话 id：旧会话的权限内存态、挂起的提问与 LSP server 进程随之清理。
  private setSessionId(sessionId: string | null): void {
    if (this.currentSessionId === sessionId) return
    if (this.currentSessionId) {
      permissionManager.clearSession(this.currentSessionId)
      questionManager.clearSession(this.currentSessionId)
      lspManager.clearSession(this.currentSessionId)
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
      // MCP 工具全名 → server 名反查（flushTurn 落库 mcp_server/kind 分类用）。
      this.mcpServerByToolName = new Map(
        mcpManager.getTools().map((handle) => [handle.fullName, handle.server]),
      )
      // 会话 system prompt = 基础提示词 + skill 注入块 + 指令文件注入块（装配时一次性拼好）。
      const systemPrompt =
        DEFAULT_SYSTEM_PROMPT +
        formatSkillsForPrompt(this.activeSkills) +
        formatInstructions(loadInstructions(cwd))
      const registry = createRegistry(
        cwd,
        this.activeCapabilities,
        this.activeMcp,
        this.activeSkills.length > 0,
        {
          systemPrompt,
          model: modelResult.model,
          beforeToolCall: (context, signal) =>
            permissionManager.gate(context, this.currentSessionId, signal),
          getSignal: () => this.agent?.signal,
          recordChildCall: (parentToolCallId, child) =>
            this.recordChildCall(parentToolCallId, child),
        },
        {
          askQuestion: (questions, toolCallId, signal) =>
            questionManager.ask(questions, this.currentSessionId, toolCallId, signal),
        },
        {
          lspManager,
          getSessionId: () => this.currentSessionId,
          cwd,
        },
      )
      const previousMessages = this.agent?.state.messages ?? []
      const agent = new Agent({
        streamFn: createAiSdkStreamFn(),
        beforeToolCall: (context, signal) =>
          permissionManager.gate(context, this.currentSessionId, signal),
        // 上下文变换：todo 清单（非空时）注入头部 + 压缩边界构造 [摘要] + 保留尾部；
        // state.messages 保持全量（UI/DB 真相源）。
        transformContext: async (messages) => {
          const todoMessage =
            this.todoList.length > 0 ? [createTodoStateMessage(this.todoList)] : []
          const boundary = this.contextBoundary
          if (!boundary) return [...todoMessage, ...messages]
          const kept = messages.filter((_, index) => {
            const seq = this.messageSeqs[index] ?? -1
            // 幽灵消息（-1，未落库/未匹配）恒保留：被压缩边界误剔除会导致模型上下文丢失历史。
            return seq < 0 || seq >= boundary.firstKeptSeq
          })
          return [
            ...todoMessage,
            createCompactionSummaryMessage(
              boundary.summary,
              boundary.tokensBefore,
              boundary.manual,
            ),
            ...kept,
          ]
        },
        initialState: {
          systemPrompt,
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
    const cwd = context.cwd ?? (context.projectItemId ? resolveCwd() : join(homedir(), "Desktop"))
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

  // 当前是否有活动 run 或排队消息：流式输出 / 正在 drain / 队列非空均为 busy。
  private isBusy(): boolean {
    return Boolean(this.agent?.state.isStreaming || this.draining || this.messageQueue.length > 0)
  }

  // 流式中入队（deferred queue）：返回 { ok:true, queued:true, queueLength, sessionId }；超限明确报错。
  private enqueueMessage(text: string): AgentSendResult {
    if (this.messageQueue.length >= MAX_QUEUE) {
      return {
        ok: false,
        error: `消息队列已满（最多 ${MAX_QUEUE} 条），请等待当前回复完成后发送。`,
      }
    }
    this.messageQueue.push(text)
    this.emitQueueChanged()
    // 流式必有会话：入队消息将处理于当前会话。
    return {
      ok: true,
      queued: true,
      queueLength: this.messageQueue.length,
      sessionId: this.currentSessionId ?? "",
    }
  }

  // 队列长度与内容变更事件（入队/每条出队/清空时推送；renderer 订阅维护权威计数与 tooltip 内容）。
  private emitQueueChanged(): void {
    this.eventSink?.({
      type: "queue_changed",
      length: this.messageQueue.length,
      messages: [...this.messageQueue],
    })
  }

  // 清空排队消息（停止 / 会话上下文切换）；空队列不发事件。
  private clearQueue(): void {
    if (this.messageQueue.length === 0) return
    this.messageQueue = []
    this.emitQueueChanged()
  }

  // drain 循环：当前 run 结束后逐条发送排队消息（每条约独立 user turn，走 beginSessionTurn/flushTurn 落库）。
  // 单轮错误仅结束该轮（错误消息经事件流作为独立气泡暴露），不中断队列；draining 防重入。
  private async kickDrain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      while (this.messageQueue.length > 0) {
        const text = this.messageQueue.shift()!
        this.emitQueueChanged()
        await this.runOne(text)
        // 会话切换守卫：drain 期间会话被切换/停止会清空队列 → 循环条件自然退出。
      }
    } finally {
      this.draining = false
    }
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
    // 流式输出 / 正在 drain / 队列非空：入队，当前 run 结束后自动发送（不 busy 拒绝、不静默丢）。
    if (this.isBusy()) {
      return this.enqueueMessage(text)
    }
    const ready = this.ensureReady()
    if ("error" in ready) {
      return { ok: false, error: ready.error }
    }
    const result = await this.runOne(text)
    // 本轮 run 结束后续发排队消息（队列为空则立即返回）。
    void this.kickDrain()
    return result
  }

  // 驱动一轮独立 run（send 空闲分派与 drain 循环共用；调用方保证非 busy）。
  private async runOne(text: string): Promise<AgentSendResult> {
    const agent = this.agent
    if (!agent) {
      return { ok: false, error: "Agent 尚未就绪，请重试。" }
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
    if (this.isBusy()) {
      return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
    }
    const ready = this.ensureReady()
    if ("error" in ready) {
      return { ok: false, error: ready.error }
    }
    const { agent } = ready
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
    // 续写 run 结束后续发排队消息。
    void this.kickDrain()
    return { ok: true, sessionId: this.currentSessionId }
  }

  // 中止当前 run 并清空排队消息（stop = 终止一切生成，干净可预期）。
  abort(): void {
    this.agent?.abort()
    this.clearQueue()
  }

  // 恢复会话上下文（renderer 新建对话/撤销时调用；空消息 = 脱离当前会话）。
  restoreMessages(messages: AgentMessage[]): void {
    this.discardPendingTurn()
    this.agent?.abort()
    // 上下文切换：清空排队消息（队列强绑定当前会话）。
    this.clearQueue()
    const ready = this.ensureReady()
    if ("error" in ready) return
    ready.agent.state.messages = [...messages]
    // 按 DB 消息 timestamp 重建 seq 对齐（未命中 = 幽灵消息，恒保留）。
    this.messageSeqs = this.syncMessageSeqs(messages)
    if (messages.length === 0) {
      this.setSessionId(null)
      this.sessionBinding = null
      this.contextBoundary = null
      this.todoList = []
      this.pendingTodo = null
    } else if (this.contextBoundary) {
      // 撤销/删除轮次可能清空保留区（seq >= firstKeptSeq）：边界失效则清除，
      // 否则模型上下文只剩摘要、历史被剔除（表现为"上下文清空"）。
      const boundary = this.contextBoundary
      const keptExists = this.messageSeqs.some((seq) => seq >= boundary.firstKeptSeq)
      if (!keptExists) this.contextBoundary = null
    }
    // 删除轮/新建会话后同步容量快照（删除回落、新建归零）。
    this.emitContextUsage()
  }

  // 恢复历史会话：从 DB 读取 entries 重建上下文、能力快照与模型；MCP/skill 按当前配置重载。
  async restoreSession(sessionId: string): Promise<AgentRestoredSession> {
    const session = agentSessionService.getSession(sessionId)
    if (!session) {
      throw new Error("SESSION_NOT_FOUND")
    }
    const { messages, seqs, capabilities, todos } = this.readSessionEntries(sessionId)

    this.discardPendingTurn()
    this.agent?.abort()
    // 会话切换：清空排队消息（队列强绑定当前会话上下文）。
    this.clearQueue()
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
    this.todoList = todos

    const ready = this.ensureReady()
    if ("error" in ready) {
      throw new Error(ready.error)
    }
    ready.agent.state.messages = [...messages]
    this.messageSeqs = seqs
    this.contextBoundary = this.readCompactionEntry(sessionId)
    // 恢复历史会话：容量按当前压缩边界估算后推送（有边界走摘要+保留尾部）。
    this.emitContextUsage()
    // state.messages 保持全量；返回给 renderer 的消息列表插入可见摘要块（UI 位置与压缩边界一致）。
    return {
      messages: this.withCompactionSummary(messages),
      activeCapabilities: capabilities,
      todos,
    }
  }

  // 按 seq 读取会话，重建消息列表、消息 → seq 对齐、最近的能力快照与任务清单。
  private readSessionEntries(sessionId: string): {
    messages: AgentMessage[]
    seqs: number[]
    capabilities: AgentCapabilitySnapshot
    todos: TodoList
  } {
    const messages: AgentMessage[] = []
    const seqs: number[] = []
    let capabilities: AgentCapabilitySnapshot = { tools: [], mcp: [], skills: [] }
    // 最后一条 todo entry（整表替换语义；后写覆盖前写）。
    let todos: TodoList = []

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
      } else if (entry.type === "todo") {
        try {
          const parsed = JSON.parse(entry.payload) as unknown
          if (Array.isArray(parsed)) todos = parsed as TodoList
        } catch {
          // 损坏的 todo entry 跳过，保留前一条。
        }
      }
    }
    return { messages, seqs, capabilities, todos }
  }

  // 历史会话列表（全量，客户端过滤）。
  listSessions(): AgentSessionSummary[] {
    return agentSessionService.listSessions()
  }

  // 删除一轮对话：以该轮用户消息 timestamp 定位，删除用户消息 + 后续 AI/toolResult 消息及关联调用。
  // 删除后会话无剩余消息则整体删除会话（保持"空会话不入库"不变量）。
  deleteMessageTurn(sessionId: string, userMessageTimestamp: number): void {
    // 全量 entries（seq 升序）：message 与 todo 交错，需按 seq 边界定位整轮删除区间。
    const allEntries = agentSessionService.listEntries(sessionId)

    // 目标用户消息 entry 的 seq（timestamp 定位；未命中 = UI-only 幽灵轮，无需写库）。
    let startSeq: number | undefined
    for (const entry of allEntries) {
      if (entry.type !== "message") continue
      try {
        const message = JSON.parse(entry.payload) as AgentMessage
        if (message.role === "user" && message.timestamp === userMessageTimestamp) {
          startSeq = entry.seq
          break
        }
      } catch {
        // 损坏的 entry 跳过。
      }
    }
    if (startSeq === undefined) return

    // 删除区间 = [startSeq, 下一个用户消息 entry)：message 与 todo 随轮删除；
    // compaction / active_capabilities 是独立边界，不随轮删（恢复仍可重建压缩摘要）。
    const turnEntryIds: string[] = []
    for (const entry of allEntries) {
      if (entry.seq < startSeq) continue
      if (entry.seq > startSeq && entry.type === "message") {
        let isUser = false
        try {
          isUser = (JSON.parse(entry.payload) as AgentMessage).role === "user"
        } catch {
          // 损坏 entry 不参与边界判定。
        }
        if (isUser) break
      }
      if (entry.type === "message" || entry.type === "todo") {
        turnEntryIds.push(entry.external_id)
      }
    }

    // 文件快照回滚：仅当被删轮是最后一条用户消息轮时回滚文件（中段轮删除维持只删消息，
    // 避免与后续轮引用/修改的文件状态冲突；完整 revert-and-cleanup 留 v2）。
    let isLastUserTurn = true
    for (const entry of allEntries) {
      if (entry.seq <= startSeq || entry.type !== "message") continue
      let isUser = false
      try {
        isUser = (JSON.parse(entry.payload) as AgentMessage).role === "user"
      } catch {
        // 损坏 entry 不参与判定。
      }
      if (isUser) {
        isLastUserTurn = false
        break
      }
    }
    if (isLastUserTurn) {
      this.revertTurnFiles(sessionId, userMessageTimestamp)
    }

    const now = new Date().toISOString()
    // 删除区间可能带走最新 todo entry：事务后按会话存续状态同步内存清单。
    const wasCurrent = this.currentSessionId === sessionId
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
    if (wasCurrent) {
      if (this.currentSessionId === sessionId) {
        // 会话仍在：重读最后一条 todo entry（删除区间可能带走最新清单）。
        this.todoList = this.readLastTodoEntry(sessionId)
      } else {
        // 会话被整体删除：todo 随会话清空。
        this.todoList = []
        this.pendingTodo = null
      }
      this.eventSink?.({ type: "todo_updated", todos: this.todoList })
    }
  }

  // 重命名会话标题（仅当会话存在）。
  renameSession(sessionId: string, title: string): void {
    if (!agentSessionService.getSession(sessionId)) return
    agentSessionService.renameSession(sessionId, title, new Date().toISOString())
  }

  // 会话分支：从指定用户轮（timestamp 定位）切割复制历史到新会话，返回新会话 id。
  // busy（流式/挂起权限请求）拒绝；切割点在已压缩区域（< firstKeptSeq）拒绝。
  forkSession(sessionId: string, userMessageTimestamp?: number): AgentForkResult {
    if (this.isBusy()) {
      return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
    }
    if (!agentSessionService.getSession(sessionId)) {
      return { ok: false, error: "会话不存在。" }
    }
    // 会话分支：队列强绑定当前会话，分支即上下文切换，清空排队消息。
    this.clearQueue()
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
    if (this.isBusy()) {
      return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
    }
    // 工作区切换：队列强绑定当前会话上下文，切换即清空排队消息。
    this.clearQueue()
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
    // 会话删除：清空排队消息（队列强绑定当前会话上下文）。
    this.clearQueue()
    if (this.currentSessionId === sessionId) {
      this.setSessionId(null)
      this.sessionBinding = null
      this.todoList = []
      this.pendingTodo = null
      this.eventSink?.({ type: "todo_updated", todos: [] })
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
    this.pendingChildCalls.clear()
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
    this.pendingChildCalls.clear()
    this.currentRunGeneration = -1
    this.pendingSnapshotStart = null
  }

  // 当前会话待发送上下文的 token 估计：有压缩边界按摘要+保留尾部（char/4），否则全量估计。
  private currentContextTokens(): number {
    const messages = this.agent?.state.messages ?? []
    const boundary = this.contextBoundary
    if (!boundary) return estimateContextTokens(messages)
    const kept = messages.filter(
      (_, index) => (this.messageSeqs[index] ?? -1) >= boundary.firstKeptSeq,
    )
    return estimateCompactedContextTokens(
      createCompactionSummaryMessage(boundary.summary, boundary.tokensBefore, boundary.manual),
      kept,
    )
  }

  // 上下文容量快照：当前上下文估计 token / 模型实际窗口，驱动状态栏百分比。
  private emitContextUsage(): void {
    this.eventSink?.({
      type: "context_usage",
      tokens: this.currentContextTokens(),
      contextWindow: this.resolveContextWindow(),
    })
  }

  // 解析状态栏显示的上下文窗口：优先显式 selection / UI 同步的 requestedModel / 当前会话模型
  // 的 limit.context（反映真实容量），模型未声明窗口时回退压缩配置窗口。
  private resolveContextWindow(selection?: ModelSelection): number {
    const settings = getModelProviderSettings()
    const activeSelection = selection ?? this.requestedModel
    const modelWindow = activeSelection
      ? settings.providers[activeSelection.provider]?.models?.[activeSelection.model]?.limit
          ?.context
      : this.agent?.state.model
        ? settings.providers[this.agent.state.model.provider]?.models?.[this.agent.state.model.id]
            ?.limit?.context
        : undefined
    return modelWindow ?? getCompactionSettings().contextWindow
  }

  // 查询当前会话上下文容量（模型切换后 renderer 主动刷新状态栏用）。
  // 携带 selection 时同时同步 requestedModel，使后续 context_usage 推送（恢复/压缩/agent_end）统一按 UI 选择的模型窗口展示。
  getContextUsage(selection?: ModelSelection): AgentContextUsage {
    if (selection) {
      this.requestedModel = selection
    }
    return {
      tokens: this.currentContextTokens(),
      contextWindow: this.resolveContextWindow(selection),
    }
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
          // 预生成落库 id：子代理内部调用以它为 parent_call_id（父 task 调用行 id 提前可知）。
          externalId: createExternalId(),
          toolName: event.toolName,
          args: truncateForStore(event.args),
          status: "running",
          result: null,
          startedAt: Date.now(),
          finishedAt: null,
          parentCallId: null,
        })
        break

      case "tool_execution_end": {
        const call = this.pendingCalls.get(event.toolCallId)
        if (call) {
          call.status = event.isError ? "error" : "success"
          call.result = truncateForStore(event.result)
          call.finishedAt = Date.now()
        }
        // todowrite：解析整表清单 → 更新内存 + 推送事件（清单由 flushTurn 同事务落 todo entry）。
        if (event.toolName === "todowrite" && !event.isError) {
          const details = (event.result as { details?: { todos?: TodoList } }).details
          const todos = details?.todos
          if (Array.isArray(todos)) {
            this.todoList = todos
            this.pendingTodo = todos
            this.eventSink?.({ type: "todo_updated", todos })
          }
        }
        break
      }

      case "agent_end":
        this.flushTurn()
        // turn 结束（正常/错误/中止均触发）：上下文定型后推送容量快照。
        this.emitContextUsage()
        break
    }
  }

  // agent_call kind 分类：mcp（工具名 ∈ MCP 全名）/ subagent（task）/ skill（read_skill）/ builtin。
  private classifyCall(toolName: string): AgentCallKind {
    if (toolName === "task") return "subagent"
    if (toolName === "read_skill") return "skill"
    if (this.mcpServerByToolName.has(toolName)) return "mcp"
    return "builtin"
  }

  // 记录子代理内部工具调用（provenance）：parent_call_id 指向触发它的父 task 调用行；
  // 与父 turn 同事务落库（entry_id 恒 null；UI 不展示，供查询/审计）。
  private recordChildCall(parentToolCallId: string, child: ChildCallInput): void {
    const parent = this.pendingCalls.get(parentToolCallId)
    if (!parent) return // 父调用未在缓冲（如 turn 已丢弃）：忽略，不落孤儿行。
    const existing = this.pendingChildCalls.get(child.toolCallId)
    this.pendingChildCalls.set(child.toolCallId, {
      toolCallId: child.toolCallId,
      // start 已预生成 id；end 更新复用（同一次调用一条记录）。
      externalId: existing?.externalId ?? createExternalId(),
      toolName: child.toolName,
      args: truncateForStore(child.args),
      status: child.status,
      result: truncateForStore(child.result),
      // 保留 start 时刻的真实起始时间（end 事件不覆盖）。
      startedAt: existing?.startedAt ?? child.startedAt,
      finishedAt: child.finishedAt,
      parentCallId: parent.externalId,
    })
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

  // 一个 turn 落库：会话创建（含能力/模型快照）+ 消息 entries + 调用记录 + todo 清单，一个事务。
  private flushTurn(): void {
    const input = this.sessionInput
    const messages = this.runMessages
    const calls = [...this.pendingCalls.values()]
    const childCalls = [...this.pendingChildCalls.values()]
    const pendingTodo = this.pendingTodo
    this.sessionInput = null
    this.runMessages = []
    this.pendingCalls.clear()
    this.pendingChildCalls.clear()
    this.pendingTodo = null
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
          externalId: call.externalId,
          entryId: entryIdByToolCallId.get(call.toolCallId) ?? null,
          parentCallId: call.parentCallId,
          // kind 分类：mcp（工具名 ∈ MCP 全名）/ subagent（task）/ skill（read_skill）/ builtin。
          kind: this.classifyCall(call.toolName),
          name: call.toolName,
          mcpServer: this.mcpServerByToolName.get(call.toolName) ?? null,
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

      // 子代理内部调用：entry_id 恒 null（非 turn 消息产物），parent_call_id 指触发它的父 task 调用行。
      for (const child of childCalls) {
        const finishedAt = child.finishedAt
        agentSessionService.insertCall({
          sessionId,
          externalId: child.externalId,
          entryId: null,
          parentCallId: child.parentCallId,
          kind: this.classifyCall(child.toolName),
          name: child.toolName,
          mcpServer: this.mcpServerByToolName.get(child.toolName) ?? null,
          status: child.status,
          args: child.args,
          result: child.result,
          durationMs: finishedAt !== null ? finishedAt - child.startedAt : null,
          startedAt: new Date(child.startedAt).toISOString(),
          finishedAt: finishedAt !== null ? new Date(finishedAt).toISOString() : null,
          createdAt: now,
          updatedAt: now,
        })
      }

      // todo 清单（本轮整表替换）：追加型 entry，payload = JSON(TodoList)；恢复/回退读最后一条。
      if (pendingTodo) {
        agentSessionService.insertEntry({
          externalId: createExternalId(),
          sessionId,
          seq,
          type: "todo",
          payload: JSON.stringify(pendingTodo),
          createdAt: now,
        })
        seq += 1
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

  // 读取会话最近的 compaction entry，重建压缩边界（无/无效则 null）。
  private readCompactionEntry(sessionId: string): CompactionBoundary | null {
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
          }
        }
      } catch {
        // 损坏 entry 跳过，继续往前找。
      }
    }
    return null
  }

  // 读取会话最后一条 todo entry（整表替换语义：后写覆盖前写；无则空清单）。
  private readLastTodoEntry(sessionId: string): TodoList {
    const entries = agentSessionService.listEntries(sessionId)
    for (let index = entries.length - 1; index >= 0; index--) {
      if (entries[index].type !== "todo") continue
      try {
        const parsed = JSON.parse(entries[index].payload) as unknown
        if (Array.isArray(parsed)) return parsed as TodoList
      } catch {
        // 损坏 entry 继续往前找。
      }
    }
    return []
  }

  // 在返回给 renderer 的消息列表中，将可见摘要块追加到消息底部（与实时压缩的 UI 位置一致；
  // 模型上下文仍走 transformContext 的边界拆分，与显示顺序解耦）。
  private withCompactionSummary(messages: AgentMessage[]): AgentMessage[] {
    const boundary = this.contextBoundary
    if (!boundary) return messages
    const summary = createCompactionSummaryMessage(
      boundary.summary,
      boundary.tokensBefore,
      boundary.manual,
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

  // turn 结束后压缩：估计上下文 token 超阈值（或 overflow 强制）时，摘要化早期历史并建立新边界。
  // 返回是否实际压缩；摘要生成失败静默保留旧边界（下轮再试）。
  // overflow 重试与阈值自动均为 manual=false。
  private async compactIfNeeded(force: boolean): Promise<boolean> {
    const config = getCompactionSettings()
    if (!config.enabled) return false
    const agent = this.agent
    if (!agent) return false
    const messages = agent.state.messages
    if (messages.length === 0) return false
    // 压缩窗口随当前模型 limit.context 动态（模型切换自动适配，无需手动配固定窗口）。
    // 保留/预留预算受模型窗口约束：配置值超过模型窗口时按比例收敛，避免触发阈值非正导致每轮都压缩。
    const contextWindow = this.resolveContextWindow()
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
    // 摘要生成是压缩的主要耗时（慢 LLM 调用）：先推送开始事件，renderer 追加 loading 占位并禁止发送。
    this.eventSink?.({ type: "compaction_start", compactionId, manual: false })
    const summary = await generateCompactionSummary(compacted)
    if (!summary) {
      // 失败：推送失败事件让 renderer 移除 loading 占位（不建立坏边界，下轮再试）。
      this.eventSink?.({ type: "compaction_failed", compactionId, manual: false })
      return false
    }
    const tokensBefore = estimateContextTokens(compacted)
    const firstKeptSeq = this.messageSeqs[cutIndex] ?? -1
    // 保留起点无有效 DB seq（删除轮次后对齐被破坏等）：不建立坏边界，
    // 否则 transformContext 会保留全部消息（压缩失效）且恢复时摘要被插到列表顶部。
    if (firstKeptSeq < 0) {
      // 摘要已生成但无法落位：通知 renderer 移除 loading 占位（否则会卡在压缩中）。
      this.eventSink?.({ type: "compaction_failed", compactionId, manual: false })
      return false
    }
    const boundary: CompactionBoundary = {
      summary,
      firstKeptSeq,
      tokensBefore,
      manual: false,
    }
    this.contextBoundary = boundary
    if (this.currentSessionId) {
      this.persistCompaction(this.currentSessionId, boundary)
    }
    // 推送可见摘要消息（renderer 以 compactionId 替换对应 loading 占位）。
    this.eventSink?.({
      type: "compaction_summary",
      compactionId,
      message: createCompactionSummaryMessage(summary, tokensBefore, false),
    })
    // 压缩后容量 = 摘要 + 保留尾部（contextBoundary 已建立，emit 自动走压缩估计）。
    this.emitContextUsage()
    return true
  }

  // 手动压缩（/compact 命令触发）：尊重设置开关；禁用/忙碌/无可压缩内容时返回具体原因，否则强制压缩。
  // 忙碌守卫兜底 renderer 侧流式判断的竞态（drain 队列等 renderer 不知情的忙态）。
  async compact(): Promise<AgentCompactResult> {
    if (!getCompactionSettings().enabled) {
      return { ok: false, error: "上下文压缩已在设置中禁用，请在设置中开启。" }
    }
    if (this.isBusy()) {
      return { ok: false, error: "当前正在生成回复，请等待回复完成后手动压缩。" }
    }
    const agent = this.agent
    if (!agent || agent.state.messages.length === 0) {
      return { ok: false, error: "当前会话暂无消息，无需压缩。" }
    }
    const messages = agent.state.messages
    if (messages.length <= 1) {
      return { ok: false, error: "历史消息过短，暂无可压缩内容。" }
    }
    const contextWindow = this.resolveContextWindow()
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
    this.eventSink?.({ type: "compaction_start", compactionId, manual: true })
    const summary = await generateCompactionSummary(compacted)
    if (!summary) {
      this.eventSink?.({ type: "compaction_failed", compactionId, manual: true })
      return { ok: false, error: "模型生成摘要失败或超时，请稍后重试。" }
    }
    const tokensBefore = estimateContextTokens(compacted)
    const firstKeptSeq = this.messageSeqs[effectiveCut] ?? -1
    if (firstKeptSeq < 0) {
      this.eventSink?.({ type: "compaction_failed", compactionId, manual: true })
      return { ok: false, error: "压缩边界定位失败，无法落库。" }
    }
    const boundary: CompactionBoundary = {
      summary,
      firstKeptSeq,
      tokensBefore,
      manual: true,
    }
    this.contextBoundary = boundary
    if (this.currentSessionId) {
      this.persistCompaction(this.currentSessionId, boundary)
    }
    this.eventSink?.({
      type: "compaction_summary",
      compactionId,
      message: createCompactionSummaryMessage(summary, tokensBefore, true),
    })
    this.emitContextUsage()
    return { ok: true }
  }

  // 撤销最后一次手动压缩（/undo 对压缩摘要触发）：清边界、删 compaction entry。
  // 自动压缩的边界 manual=false 不可撤销；撤销后上下文容量回到全量估计。
  async undoCompaction(): Promise<AgentUndoCompactionResult> {
    const boundary = this.contextBoundary
    if (!boundary || !boundary.manual) {
      return { ok: false, error: "只能撤销手动触发的上下文压缩。" }
    }
    this.contextBoundary = null
    if (this.currentSessionId) {
      this.removeLastCompactionEntry(this.currentSessionId)
    }
    this.emitContextUsage()
    return { ok: true }
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
