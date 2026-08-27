import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type {
  AgentCompactResult,
  AgentContextUsage,
  AgentEvent,
  AgentForkResult,
  AgentMessage,
  AgentRestoredSession,
  AgentSendContext,
  AgentSendOptions,
  AgentSendResult,
  AgentSessionSummary,
  AgentSwitchProjectResult,
  AgentSwitchWorktreeResult,
  AgentUndoCompactionResult,
  CopySessionOptions,
  CopySessionResult,
  ExportSessionOptions,
  ExportSessionResult,
  JobId,
  JobReadResult,
  JobSnapshot,
  JobStatus,
  PromptAssembly,
  TodoList,
  TodoStateMessage,
  UserMessage,
  UserMessageCommand,
} from "@shared/contracts/agent"
import type { SessionProjectionState } from "@shared/contracts/sessionProjection"
import type { ModelSelection } from "@shared/settings"
import { agentSessionService } from "@/services/agentSessionService"
import { getDefaultCapabilities } from "@/services/capabilityService"
import { projectService } from "@/services/projectService"
import { getAppDataRoot } from "../paths"
import {
  ALL_TOOL_NAMES,
  buildSystemPromptSync,
  createRegistry,
  MAX_INJECTED_SKILLS,
  resolveCwd,
} from "./assembly"
import { createCompactionSummaryMessage } from "./compaction"
import { pruneHistoricalToolOutputs } from "./compaction/contextPruner"
import { ContextCompactor } from "./contextCompactor"
import { TurnContext } from "./core/turnContext"
import { Agent } from "./core/agent"
import type { AgentTool } from "./core/types"
import { copySessionText, exportSessionToFile } from "./export/sessionExporter"
import { repeatToolGuard } from "./guard/repeatToolGuard"
import { jobRegistry } from "./jobs/jobRegistry"
import { lspManager } from "./lsp/lspManager"
import { mcpManager } from "./mcp/mcpManager"
import { permissionManager } from "./permissions/permissionManager"
import type { PersonalityName } from "./prompts/personalities"
import { promptTemplateLoader } from "./prompts/promptTemplateLoader"
import { defaultSystemPromptManager } from "./prompts/systemPromptManager"
import { questionManager } from "./question/questionManager"
import { type LoadedSkill, skillLoader, stripFrontmatter } from "./skills/skillLoader"
import { spillManager } from "./spill/spillManager"
import { createAiSdkStreamFn } from "./stream/aiSdkStreamFn"
import { resolveDefaultModel, resolveModelSelection } from "./stream/modelFactory"
import { generateSessionTitle } from "./titleGenerator"
import { ToolRegistry } from "./tools/registry"
import { type AttachedFile, isOverflowFailure, type SessionBinding, TurnStore } from "./turnStore"

// 排队消息上限（流式中入队；超限明确报错，不覆盖、不静默丢）。
const MAX_QUEUE = 20

// 构造任务清单状态消息（transformContext 注入；不进 state.messages）。
const createTodoStateMessage = (todos: TodoList): TodoStateMessage => ({
  role: "todoState",
  todos,
  timestamp: Date.now(),
})

/**
 * 会话级 Agent 装配：持有 Agent 实例与工具注册表，将事件转发给 IPC 层。
 *
 * Agent 实例跨 send 持久（保留会话上下文）；cwd 或模型配置变化时重建工具集与模型。
 * 持久化策略：turn 内消息/调用缓冲（TurnStore），agent_end 时一个事务落库（首次落库连带能力快照）。
 * 上下文压缩与容量估计委托 ContextCompactor；工具注册表装配见 assembly.ts。
 */
class AgentRunner {
  private agent?: Agent
  private registry?: ToolRegistry
  private cwd?: string
  private personality?: PersonalityName
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
  // 流式输出期间排队待发的消息（FIFO，内存态不落库；当前 run 结束后逐条自动发送）。
  private messageQueue: string[] = []
  // 队列是否正在被 drain 循环处理（防重入；drain 期间新 send 一律入队保持 FIFO）。
  private draining = false

  // 本轮 turn 缓冲与持久化（消息/调用/快照/任务清单/seq 对齐）。
  private readonly turnStore: TurnStore
  // 上下文压缩与容量估计（摘要边界、自动/手动压缩、状态栏容量）。
  private readonly compactor: ContextCompactor
  // 当前执行轮次环境上下文（Codex Turn 状态机切片）
  private currentTurnContext?: TurnContext

  constructor() {
    this.compactor = new ContextCompactor({
      getAgent: () => this.agent,
      getMessageSeqs: () => this.turnStore.getMessageSeqs(),
      getSessionId: () => this.currentSessionId,
      getRequestedModel: () => this.requestedModel,
      isBusy: () => this.isBusy(),
      emit: (event) => this.eventSink?.(event),
    })
    this.turnStore = new TurnStore({
      setSessionId: (sessionId) => this.setSessionId(sessionId),
      getCurrentSessionId: () => this.currentSessionId,
      setSessionBinding: (binding) => {
        this.sessionBinding = binding
      },
      getCwd: () => this.cwd,
      emit: (event) => this.eventSink?.(event),
      emitUsage: () => this.compactor.emitUsage(),
    })
    void Promise.resolve().then(() => spillManager.cleanStaleSpills(7))

    // 订阅后台长任务实时事件，向 UI 广播（静默模式：不伪造用户消息，状态由 UI 抽屉与工具主权管理）
    jobRegistry.onJobEvent((event) => this.eventSink?.(event))
  }

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
    if (sessionId === null) {
      this.personality = undefined
    }
  }

  // 保证 Agent 就绪；返回错误信息时表示不可用。
  private ensureReady(): { agent: Agent } | { error: string } {
    // 每次装配刷新权限配置与 MCP 门控集（设置页保存后自然生效）。
    permissionManager.load()
    permissionManager.setMcpTools(this.activeMcp)

    let cwd = this.requestedCwd ?? resolveCwd()

    // 物理存在性校验与自动兜底回退：若当前路径不存在，尝试回退到所属项目路径或系统默认项目
    if (cwd && !existsSync(cwd)) {
      let fallbackCwd: string | undefined
      if (this.sessionBinding?.projectId) {
        const projects = projectService.listProjects()
        const currentProj = projects.find((p) => p.id === this.sessionBinding?.projectId)
        if (currentProj?.path && existsSync(currentProj.path)) {
          fallbackCwd = currentProj.path
        }
      }
      if (!fallbackCwd) {
        fallbackCwd = resolveCwd()
      }
      if (fallbackCwd && existsSync(fallbackCwd)) {
        cwd = fallbackCwd
        this.requestedCwd = fallbackCwd
        if (this.currentSessionId) {
          agentSessionService.updateSessionCwd(
            this.currentSessionId,
            fallbackCwd,
            new Date().toISOString(),
          )
        }
      }
    }

    if (!cwd || !existsSync(cwd)) {
      return { error: "未找到可用的项目目录。请先在项目管理中创建并绑定文件系统项目。" }
    }

    const modelResult = this.requestedModel
      ? resolveModelSelection(this.requestedModel)
      : resolveDefaultModel()
    if ("error" in modelResult) {
      return { error: modelResult.error }
    }

    // 能力指纹：内置激活集 + MCP 工具 + 注入 skill + 人格设定 任一变化即重建装配。
    const capabilitiesSignature = JSON.stringify([
      this.activeCapabilities,
      this.activeMcp,
      this.activeSkills.map((skill) => skill.name),
      this.personality,
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
      this.turnStore.setMcpToolNames(
        new Map(mcpManager.getTools().map((handle) => [handle.fullName, handle.server])),
      )
      // 会话 system prompt：动态分层提示词装配（基础身份 + 核心指导 + 模型自适应 + 技能分层 + 指令文件 + 环境 + 沙箱策略）。
      const currentSandboxPolicy = permissionManager.getSandboxPolicy()
      const systemPrompt = buildSystemPromptSync({
        cwd,
        sessionId: this.currentSessionId ?? undefined,
        modelId: modelResult.model.id,
        sandboxPolicy: currentSandboxPolicy,
        activeSkills: this.activeSkills,
        personality: this.personality,
      })
      const registry = createRegistry(
        cwd,
        this.activeCapabilities,
        this.activeMcp,
        this.activeSkills.length > 0,
        {
          systemPrompt,
          model: modelResult.model,
          sandboxPolicy: currentSandboxPolicy,
          beforeToolCall: (context, signal) =>
            permissionManager.gate(context, this.currentSessionId, signal),
          getSignal: () => this.agent?.signal,
          recordChildCall: (parentToolCallId, child) =>
            this.turnStore.recordChildCall(parentToolCallId, child),
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
        beforeToolCall: async (context, signal) => {
          this.currentTurnContext?.recordToolCall()
          if (this.currentSessionId) {
            const guardResult = repeatToolGuard.checkBeforeExecute(
              this.currentSessionId,
              context.toolCall.name,
              context.args,
            )
            if (guardResult.blocked) {
              return { block: true, reason: guardResult.blockReason }
            }
          }
          return permissionManager.gate(context, this.currentSessionId, signal)
        },
        afterToolCall: async (context) => {
          if (this.currentSessionId) {
            const guardResult = repeatToolGuard.checkBeforeExecute(
              this.currentSessionId,
              context.toolCall.name,
              context.args,
            )
            if (guardResult.reminder && !context.isError) {
              return {
                content: [...context.result.content, { type: "text", text: guardResult.reminder }],
              }
            }
          }
          return undefined
        },
        // 上下文变换：Tier-1 工具大输出修剪 + todo 清单注入 + 压缩边界构造 [摘要] + 保留尾部；
        // state.messages 保持全量（UI/DB 真相源）。
        transformContext: async (messages) => {
          const prunedMessages = pruneHistoricalToolOutputs(messages)
          const todoList = this.turnStore.getTodo()
          const todoMessage = todoList.length > 0 ? [createTodoStateMessage(todoList)] : []
          const boundary = this.compactor.getBoundary()
          if (!boundary) return [...todoMessage, ...prunedMessages]
          const messageSeqs = this.turnStore.getMessageSeqs()
          const kept = prunedMessages.filter((_, index) => {
            const seq = messageSeqs[index] ?? -1
            // 幽灵消息（-1，未落库/未匹配）恒保留：被压缩边界误剔除会导致模型上下文丢失历史。
            return seq < 0 || seq >= boundary.firstKeptSeq
          })
          return [
            ...todoMessage,
            createCompactionSummaryMessage(
              boundary.summary,
              boundary.tokensBefore,
              boundary.manual,
              boundary.model,
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
        this.turnStore.handleEvent(event)
        this.eventSink?.(event)
      })
      this.agent = agent
      this.registry = registry
      this.cwd = cwd
      this.builtSignature = capabilitiesSignature
    } else {
      const currentSandboxPolicy = permissionManager.getSandboxPolicy()
      this.agent.state.systemPrompt = buildSystemPromptSync({
        cwd,
        sessionId: this.currentSessionId ?? undefined,
        modelId: modelResult.model.id,
        sandboxPolicy: currentSandboxPolicy,
        activeSkills: this.activeSkills,
        personality: this.personality,
      })
    }

    return { agent: this.agent }
  }

  // 新会话（无当前会话）时冻结归属、cwd 与能力（全量）；既有会话忽略 context 的 binding/cwd。
  private freezeNewSession(context: AgentSendContext): void {
    if (this.currentSessionId) return
    this.sessionBinding = {
      projectId: context.projectId,
      page: context.page,
    }
    const cwd = context.cwd ?? (context.projectId ? resolveCwd() : join(homedir(), "Desktop"))
    if (cwd) this.requestedCwd = cwd
    if (context.personality) {
      this.personality = context.personality
    }
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

  private getEffectiveCwd(): string | undefined {
    return this.cwd ?? this.requestedCwd ?? resolveCwd()
  }

  // 统一指令宏展开与元数据解析
  private _expandAndDetectCommand(
    text: string,
    overrideCwd?: string,
  ): {
    expanded: string
    command?: UserMessageCommand
  } {
    const cwd = overrideCwd ?? this.getEffectiveCwd()
    const skillExpanded = this._expandSkillCommand(text)
    if (skillExpanded !== text) {
      const match = text.match(/^\/skill:([^\s]+)/)
      return {
        expanded: skillExpanded,
        command: {
          name: match ? match[1] : "skill",
          kind: "skill",
        },
      }
    }

    const templateMatch = promptTemplateLoader.match(text, cwd)
    if (templateMatch) {
      return {
        expanded: templateMatch.expanded,
        command: {
          name: templateMatch.template.name,
          kind: "prompt",
          source: templateMatch.template.source,
        },
      }
    }

    return { expanded: text }
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
  // options.delivery === "steer" 时：若当前正在流式运行，则直接作为 steer 即时插话注入 turn 边界。
  async send(
    text: string,
    selection?: ModelSelection,
    context?: AgentSendContext,
    options?: AgentSendOptions,
  ): Promise<AgentSendResult> {
    if (selection !== undefined) {
      this.requestedModel = selection
    }
    // MCP server 连接（幂等；配置空时立即返回）。
    await mcpManager.ensureConnected()
    if (context !== undefined) {
      this.freezeNewSession(context)
    }
    if (options?.personality) {
      this.personality = options.personality
    }

    // 即时插话（steer）：在流式生成中直接注入当前 run 的 turn 边界
    if (options?.delivery === "steer" && this.agent?.state.isStreaming) {
      const isNewSession = !this.currentSessionId
      if (!isNewSession && this.currentSessionId) {
        const { expanded, command } = this._expandAndDetectCommand(text, context?.cwd)
        const steerMessage: UserMessage = {
          role: "user",
          content: expanded,
          timestamp: Date.now(),
          isSteer: true,
          command: command ?? { name: "steer", kind: "builtin" },
        }
        if (context?.files && context.files.length > 0) {
          steerMessage.files = this.processPendingFiles(this.currentSessionId, context.files)
        }
        this.agent.steer(steerMessage)
        return {
          ok: true,
          steered: true,
          sessionId: this.currentSessionId,
        }
      }
    }

    // 流式输出 / 正在 drain / 队列非空：入队，当前 run 结束后自动发送（不 busy 拒绝、不静默丢）。
    if (this.isBusy()) {
      return this.enqueueMessage(text)
    }
    const ready = this.ensureReady()
    if ("error" in ready) {
      return { ok: false, error: ready.error }
    }
    const result = await this.runOne(text, context?.files, context?.cwd)
    // 本轮 run 结束后续发排队消息（队列为空则立即返回）。
    void this.kickDrain()
    return result
  }

  // 复制附件文件到 ~/.lx/session/<sessionId>/<image|text>/ 目录并返回新属性。
  private processPendingFiles(sessionId: string, files: AttachedFile[]): AttachedFile[] {
    const copied: AttachedFile[] = []
    const sessionDir = join(getAppDataRoot(), "session", sessionId)

    for (const file of files) {
      const subFolder = file.type === "image" ? "image" : "text"
      const destFolder = join(sessionDir, subFolder)

      if (!existsSync(destFolder)) {
        mkdirSync(destFolder, { recursive: true })
      }

      const destPath = join(destFolder, file.name)
      try {
        copyFileSync(file.path, destPath)
        copied.push({
          name: file.name,
          path: destPath,
          type: file.type,
          size: file.size,
          extension: file.extension,
        })
      } catch (err) {
        console.error(`Failed to copy attachment file: ${file.path} to ${destPath}`, err)
      }
    }
    return copied
  }

  // 驱动一轮独立 run（send 空闲分派与 drain 循环共用；调用方保证非 busy）。
  private async runOne(
    text: string,
    files?: AttachedFile[],
    overrideCwd?: string,
  ): Promise<AgentSendResult> {
    const agent = this.agent
    if (!agent) {
      return { ok: false, error: "Agent 尚未就绪，请重试。" }
    }
    // 新会话：从空上下文开始（旧会话已在 DB 落盘，由恢复流程重建）。
    const isNewSession = !this.currentSessionId
    if (isNewSession) {
      agent.state.messages = []
      this.turnStore.resetSeqs()
      this.compactor.setBoundary(null)
      this.turnStore.resetOverflow()
    }
    // 显式 /skill: 或 Prompt 模板在 main 侧展开正文（未命中原样透传）。
    const { expanded, command } = this._expandAndDetectCommand(text, overrideCwd)
    this.beginSessionTurn(text)
    // 文件快照：turn 开始捕获 hash_start（仅 git 仓库，失败静默降级）。
    this.turnStore.captureSnapshot()
    // 新建会话：发送后立即建会话行并触发 AI 标题生成（输入只用用户消息，不等一轮输出完成）。
    if (isNewSession && this.turnStore.getSessionInput()) {
      agentSessionService.transaction(() => {
        this.turnStore.createSessionIfNeeded(
          this.turnStore.getSessionInput()!,
          new Date().toISOString(),
        )
      })
      if (this.currentSessionId) {
        this.generateTitle(this.currentSessionId, text)
      }
    }

    // 复制和处理待发送的文件/图片
    if (files && files.length > 0 && this.currentSessionId) {
      this.turnStore.setCopiedFiles(this.processPendingFiles(this.currentSessionId, files))
    } else {
      this.turnStore.clearCopiedFiles()
    }

    // 初始化本轮 Turn 上下文与环境切片
    const effectiveCwd = this.cwd ?? resolveCwd() ?? homedir()
    this.currentTurnContext = new TurnContext({
      turnId: `turn-${Date.now()}`,
      sessionId: this.currentSessionId ?? "draft-session",
      cwd: effectiveCwd,
      modelSelection: this.requestedModel,
      capabilities: this.activeCapabilities,
    })

    try {
      agent.state.systemPrompt = buildSystemPromptSync({
        cwd: this.currentTurnContext.snapshot.cwd,
        sessionId: this.currentSessionId ?? undefined,
        activeSkills: this.activeSkills,
        personality: this.personality,
        variables: this.currentTurnContext.snapshot.variables,
      })
      const userMessage: UserMessage = {
        role: "user",
        content: expanded,
        timestamp: Date.now(),
        ...(command ? { command } : {}),
      }
      await agent.prompt(userMessage)
      // context-overflow 自动压缩重试一次（决策 9）：移除错误消息 → 强制压缩 → 续跑重试。
      if (this.turnStore.consumeOverflow()) {
        this.removeLastOverflowMessage()
        const compacted = await this.compactor.compactIfNeeded(true)
        if (!compacted) {
          throw new Error("上下文超出模型窗口且自动压缩失败，请新建会话或重试。")
        }
        // 重试用 continue 而非重新 prompt：本轮 user 消息已落库，避免重复注入。
        this.beginSessionTurn(text)
        await agent.continue()
        if (this.turnStore.consumeOverflow()) {
          this.removeLastOverflowMessage()
          throw new Error("上下文压缩后仍超出模型窗口，请新建会话或减少会话长度。")
        }
      } else {
        // 阈值压缩：turn 结束后同步执行（阻塞下一条消息数秒可接受）。
        await this.compactor.compactIfNeeded(false)
      }
    } catch (error) {
      this.discardPendingTurn()
      this.currentTurnContext = undefined
      // 首轮 prompt 失败且会话无任何消息落库：清理刚创建的空会话。
      if (
        isNewSession &&
        this.currentSessionId &&
        !this.turnStore.hasSessionMessages(this.currentSessionId)
      ) {
        const sessionIdToDelete = this.currentSessionId
        agentSessionService.deleteSession(sessionIdToDelete)
        this.setSessionId(null)
        this.sessionBinding = null

        // 级联清理对应的物理附件文件夹
        try {
          const sessionDir = join(getAppDataRoot(), "session", sessionIdToDelete)
          if (existsSync(sessionDir)) {
            rmSync(sessionDir, { recursive: true, force: true })
          }
        } catch (err) {
          console.error(
            `Failed to clean up failed session attachments directory: ${sessionIdToDelete}`,
            err,
          )
        }
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
  async continue(prompt?: string): Promise<AgentSendResult> {
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

    const continueText = prompt?.trim() || "请继续输出刚才被中断的内容。"
    // steer 消息在下一轮 loop 前被消费，作为可见 user 气泡随事件流落库。
    agent.steer({ role: "user", content: continueText, timestamp: Date.now() })
    this.beginSessionTurn(continueText)
    // 文件快照：turn 开始捕获 hash_start（仅 git 仓库，失败静默降级）。
    this.turnStore.captureSnapshot()
    try {
      await agent.continue()
      // continue 侧不做 overflow 自动重试（续写指令已消费）；识别到则移除错误轮并返回错误。
      if (this.turnStore.consumeOverflow()) {
        this.removeLastOverflowMessage()
        throw new Error("上下文超出模型窗口，请新建会话或重试。")
      }
      await this.compactor.compactIfNeeded(false)
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
    this.currentTurnContext = undefined
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
    this.turnStore.syncMessageSeqs(messages)
    if (messages.length === 0) {
      this.setSessionId(null)
      this.sessionBinding = null
      this.compactor.setBoundary(null)
      this.turnStore.clearTodo()
    } else if (this.compactor.getBoundary()) {
      // 撤销/删除轮次可能清空保留区（seq >= firstKeptSeq）：边界失效则清除，
      // 否则模型上下文只剩摘要、历史被剔除（表现为"上下文清空"）。
      const boundary = this.compactor.getBoundary()!
      const keptExists = this.turnStore.getMessageSeqs().some((seq) => seq >= boundary.firstKeptSeq)
      if (!keptExists) this.compactor.setBoundary(null)
    }
    // 删除轮/新建会话后同步容量快照（删除回落、新建归零）。
    this.compactor.emitUsage()
  }

  // 恢复历史会话：从 DB 读取 entries 重建上下文、能力快照与模型；MCP/skill 按当前配置重载。
  async restoreSession(sessionId: string): Promise<AgentRestoredSession> {
    const session = agentSessionService.getSession(sessionId)
    if (!session) {
      throw new Error("SESSION_NOT_FOUND")
    }
    const { messages, seqs, capabilities, todos } = this.turnStore.readSessionEntries(sessionId)

    this.discardPendingTurn()
    this.agent?.abort()
    // 会话切换：清空排队消息（队列强绑定当前会话上下文）。
    this.clearQueue()
    await mcpManager.ensureConnected()
    this.setSessionId(session.external_id)
    this.sessionBinding = {
      projectId: session.project_id ?? undefined,
      page: session.page ?? undefined,
    }
    // 能力全量（与新建会话一致）；MCP/skill 按当前配置重载（外部资源），快照仅展示/校验。
    this.activeCapabilities = getDefaultCapabilities().tools
    this.requestedCwd = session.cwd
    this.activeMcp = this.resolveMcpTools()
    this.activeSkills = this.resolveInjectedSkills(session.cwd)
    this.turnStore.loadTodo(todos)

    const ready = this.ensureReady()
    if ("error" in ready) {
      throw new Error(ready.error)
    }
    ready.agent.state.messages = [...messages]
    this.turnStore.setMessageSeqs(seqs)
    // 恢复历史会话：压缩边界按当前 compaction entry 重建，容量随之推送。
    this.compactor.loadBoundary(sessionId)
    this.compactor.emitUsage()
    // state.messages 保持全量；返回给 renderer 的消息列表插入可见摘要块（UI 位置与压缩边界一致）。
    return {
      messages: this.compactor.withSummary(messages),
      activeCapabilities: capabilities,
      todos,
    }
  }

  // 历史会话列表（全量，客户端过滤）。
  listSessions(): AgentSessionSummary[] {
    return agentSessionService.listSessions()
  }

  // 获取当前会话状态投影快照。
  getSessionProjection(): SessionProjectionState {
    return this.turnStore.getProjection()
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

        // 检测并删除附件文件
        if (entry.type === "message") {
          try {
            const msg = JSON.parse(entry.payload) as AgentMessage
            if (msg.role === "user" && msg.files) {
              for (const file of msg.files) {
                if (existsSync(file.path)) {
                  rmSync(file.path, { force: true })
                }
              }
            }
          } catch {
            // 忽略损坏的消息 payload
          }
        }
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
      this.turnStore.revertTurnFiles(sessionId, userMessageTimestamp)
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
        this.turnStore.loadTodo(this.turnStore.readLastTodoEntry(sessionId))
      } else {
        // 会话被整体删除：todo 随会话清空。
        this.turnStore.clearTodo()
      }
      this.eventSink?.({ type: "todo_updated", todos: this.turnStore.getTodo() })
    }

    // 删除区间文件后清理空文件夹
    try {
      const sessionDir = join(getAppDataRoot(), "session", sessionId)
      const cleanEmptyDir = (dir: string) => {
        if (existsSync(dir)) {
          const filesList = readdirSync(dir)
          if (filesList.length === 0) {
            rmSync(dir, { recursive: true, force: true })
          }
        }
      }
      cleanEmptyDir(join(sessionDir, "image"))
      cleanEmptyDir(join(sessionDir, "text"))
      cleanEmptyDir(sessionDir)
    } catch {}
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
      const boundary = this.compactor.readBoundary(sessionId)
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

  // 切换当前会话项目：streaming 中拒绝；更新装配目标并持久化会话 project_id 与 cwd。
  // 已落库会话直接改 project_id 与 cwd；空白新会话仅更新 requestedCwd 与 binding。
  // 下次 send 的 ensureReady 检测到 cwd 变化后按新目录重建工具集与 skill 注入。
  switchProject(projectId: string, path: string): AgentSwitchProjectResult {
    if (this.isBusy()) {
      return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
    }
    // 项目切换：队列强绑定当前会话上下文，切换即清空排队消息。
    this.clearQueue()
    this.requestedCwd = path
    const normalizedProjectId = projectId || undefined
    if (this.sessionBinding) {
      this.sessionBinding.projectId = normalizedProjectId
    } else {
      this.sessionBinding = { projectId: normalizedProjectId }
    }
    if (this.currentSessionId) {
      agentSessionService.updateSessionProject(
        this.currentSessionId,
        normalizedProjectId ?? null,
        path,
        new Date().toISOString(),
      )
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
      this.turnStore.clearTodo()
      this.eventSink?.({ type: "todo_updated", todos: [] })
    }
    agentSessionService.deleteSession(sessionId)
    spillManager.cleanSessionSpill(sessionId)
    jobRegistry.cleanSessionJobs(sessionId)

    // 删除会话附件文件夹
    try {
      const sessionDir = join(getAppDataRoot(), "session", sessionId)
      if (existsSync(sessionDir)) {
        rmSync(sessionDir, { recursive: true, force: true })
      }
    } catch (err) {
      console.error(`Failed to delete session attachments directory for session: ${sessionId}`, err)
    }
  }

  // 当前会话上下文。
  getMessages(): AgentMessage[] {
    return this.agent?.state.messages ?? []
  }

  // 当前会话使用的工具列表。
  getActiveTools(): AgentTool<any>[] {
    return this.registry?.getActive() ?? []
  }

  // 当前会话绑定的工作目录（未初始化时回退到默认工作目录）。
  getCurrentCwd(): string | undefined {
    return this.cwd ?? this.requestedCwd ?? resolveCwd()
  }

  // run 开始：重置 turn 缓冲并捕获本次落盘输入（会话归属、cwd 与能力快照）。
  private beginSessionTurn(text: string): void {
    this.turnStore.beginTurn({
      text,
      binding: this.sessionBinding ?? {},
      cwd: this.cwd ?? "",
      capabilities: {
        tools: [...this.activeCapabilities],
        mcp: [...this.activeMcp],
        skills: this.activeSkills.map((skill) => skill.name),
      },
    })
  }

  // 丢弃未落盘的 turn（恢复/新建/失败时调用；残留事件不再落盘）。
  private discardPendingTurn(): void {
    this.turnStore.discardTurn()
  }

  // 查询当前上下文容量（模型切换后 renderer 主动刷新状态栏用）。
  // 携带 selection 时同时同步 requestedModel，使后续 context_usage 推送（恢复/压缩/agent_end）统一按 UI 选择的模型窗口展示。
  getContextUsage(selection?: ModelSelection): AgentContextUsage {
    if (selection) {
      this.requestedModel = selection
    }
    return this.compactor.getUsage(selection)
  }

  // 手动压缩（委托 ContextCompactor；renderer 触发 /compact）。
  compact(): Promise<AgentCompactResult> {
    return this.compactor.compact()
  }

  // 撤销最后一次手动压缩（委托 ContextCompactor；renderer 对摘要触发 /undo）。
  undoCompaction(): Promise<AgentUndoCompactionResult> {
    return this.compactor.undo()
  }

  // 查询会话装配的完整系统提示词与注入配置（执行流程面板展示用）。
  async getPromptAssembly(sessionId?: string, cwd?: string): Promise<PromptAssembly> {
    const targetCwd = cwd ?? this.cwd ?? this.requestedCwd ?? resolveCwd() ?? ""
    const targetSessionId = sessionId ?? this.currentSessionId ?? undefined
    const activeSkills = this.activeSkills
    const currentSandboxPolicy = permissionManager.getSandboxPolicy()
    const modelId = this.agent?.state.model.id

    const assembly = await defaultSystemPromptManager.assemble({
      cwd: targetCwd,
      sessionId: targetSessionId,
      modelId,
      sandboxPolicy: currentSandboxPolicy,
      activeSkills,
    })

    const activeTools: string[] = this.registry
      ? this.registry.getAll().map((tool) => tool.name)
      : Array.from(ALL_TOOL_NAMES)

    return {
      ...assembly,
      activeTools,
    }
  }

  // 从 state.messages 尾部移除 overflow 错误消息（消息未落库，messageSeqs 无对应项）。
  private removeLastOverflowMessage(): void {
    const messages = this.agent?.state.messages
    if (!messages) return
    while (messages.length > 0 && isOverflowFailure(messages[messages.length - 1])) {
      messages.pop()
    }
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

  // 导出会话（HTML / Markdown / JSONL）
  async exportSession(options: ExportSessionOptions): Promise<ExportSessionResult> {
    const targetSessionId = options.sessionId || this.currentSessionId
    let restoredSession: AgentRestoredSession
    let summary: AgentSessionSummary

    if (targetSessionId) {
      const sessionSummary = agentSessionService.getSession(targetSessionId)
      if (!sessionSummary) {
        return { ok: false, error: `会话不存在: ${targetSessionId}` }
      }
      summary = {
        id: sessionSummary.external_id,
        title: sessionSummary.title,
        cwd: sessionSummary.cwd,
        projectId: sessionSummary.project_id ?? null,
        createdAt: sessionSummary.created_at,
        updatedAt: sessionSummary.updated_at,
      }
      restoredSession = await this.restoreSession(targetSessionId)
    } else {
      // 纯内存态会话（尚未落盘首条消息）
      const messages = this.agent?.state.messages ?? []
      if (messages.length === 0) {
        return { ok: false, error: "当前会话暂无消息可导出" }
      }
      summary = {
        id: "in-memory",
        title: "未命名会话",
        cwd: this.getCurrentCwd() ?? "",
        projectId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      restoredSession = {
        messages,
        activeCapabilities: { tools: [], mcp: [], skills: [] },
        todos: [],
      }
    }

    if (restoredSession.messages.length === 0) {
      return { ok: false, error: "会话内容为空，无法导出" }
    }

    try {
      return await exportSessionToFile(restoredSession, summary, options)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "导出失败" }
    }
  }

  // 复制会话内容（Markdown 全文或最后一条 Assistant 回复）
  async copySession(options?: CopySessionOptions): Promise<CopySessionResult> {
    const targetSessionId = options?.sessionId || this.currentSessionId
    let restoredSession: AgentRestoredSession

    let summary: AgentSessionSummary | undefined
    if (targetSessionId) {
      const sessionSummary = agentSessionService.getSession(targetSessionId)
      if (sessionSummary) {
        summary = {
          id: sessionSummary.external_id,
          title: sessionSummary.title,
          cwd: sessionSummary.cwd,
          projectId: sessionSummary.project_id ?? null,
          createdAt: sessionSummary.created_at,
          updatedAt: sessionSummary.updated_at,
        }
      }
      restoredSession = await this.restoreSession(targetSessionId)
    } else {
      const messages = this.agent?.state.messages ?? []
      restoredSession = {
        messages,
        activeCapabilities: { tools: [], mcp: [], skills: [] },
        todos: [],
      }
    }

    if (restoredSession.messages.length === 0) {
      return { ok: false, error: "暂无内容可复制" }
    }

    try {
      const text = copySessionText(restoredSession, options, summary)
      return { ok: true, text }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "复制失败" }
    }
  }

  // 查询当前会话全部可见后台任务（严格按会话隔离，无会话时返回空）。
  listJobs(sessionId?: string): JobSnapshot[] {
    const targetSessionId = sessionId ?? this.currentSessionId
    if (!targetSessionId) return []
    return jobRegistry.listJobs(targetSessionId)
  }

  // 终止指定后台长任务（向进程树发送 SIGTERM / taskkill）。
  async killJob(
    jobId: JobId,
    reason?: string,
  ): Promise<{ ok: boolean; status?: JobStatus; error?: string }> {
    return jobRegistry.killJob(jobId, reason, this.currentSessionId ?? undefined)
  }

  // 移除/关闭指定后台长任务记录。
  async removeJob(jobId: JobId): Promise<{ ok: boolean; error?: string }> {
    return jobRegistry.removeJob(jobId, this.currentSessionId ?? undefined)
  }

  // 清理当前会话全部已结束的后台长任务。
  clearSettledJobs(sessionId?: string): { count: number } {
    const targetSessionId = sessionId ?? this.currentSessionId
    if (!targetSessionId) return { count: 0 }
    return jobRegistry.clearSettledJobs(targetSessionId)
  }

  // 读取指定后台长任务日志输出（默认以 full 模式供 UI 完整查看历史日志）。
  async readJobOutput(
    jobId: JobId,
    wait?: boolean,
    timeoutMs?: number,
    mode: "delta" | "full" = "full",
  ): Promise<JobReadResult | null> {
    return jobRegistry.readOutput(jobId, wait, timeoutMs, this.currentSessionId ?? undefined, mode)
  }
}

// AgentRunner 单例。
export const agentRunner = new AgentRunner()
