import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type {
  AgentCompactResult,
  AgentContextUsage,
  AgentEvent,
  AgentMessage,
  AgentSendContext,
  AgentSendOptions,
  AgentSendResult,
  AgentSwitchProjectResult,
  AgentSwitchWorktreeResult,
  AgentUndoCompactionResult,
  ModelSwitchMessage,
  PromptAssembly,
  TodoList,
  TodoStateMessage,
  UserMessage,
  UserMessageCommand,
} from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import { agentSessionService, createExternalId } from "@/services/agentSessionService"
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
import { Agent } from "./core/agent"
import { TurnContext } from "./core/turnContext"
import type { AgentTool } from "./core/types"
import { repeatToolGuard } from "./guard/repeatToolGuard"
import { lspManager } from "./lsp/lspManager"
import { mcpManager } from "./mcp/mcpManager"
import { permissionManager } from "./permissions/permissionManager"
import { detectModelFamily, getModelAdaptiveInstructions } from "./prompts/modelAdapters"
import type { PersonalityName } from "./prompts/personalities"
import { promptTemplateLoader } from "./prompts/promptTemplateLoader"
import { defaultSystemPromptManager } from "./prompts/systemPromptManager"
import { questionManager } from "./question/questionManager"
import { type LoadedSkill, skillLoader, stripFrontmatter } from "./skills/skillLoader"
import { createAiSdkStreamFn } from "./stream/aiSdkStreamFn"
import { resolveDefaultModel, resolveModelSelection } from "./stream/modelFactory"
import { SubagentPool } from "./subagent/subagentPool"
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

export interface SessionRunnerOptions {
  sessionId: string | null
  tabId?: string
  eventSink?: (event: AgentEvent) => void
  onSessionCreated?: (runner: AgentSessionRunner, oldKey: string, newSessionId: string) => void
}

/**
 * 单会话 Agent 实例运行器：负责单个会话/标签页的状态机循环、工具注册、上下文管理与事件分发。
 */
export class AgentSessionRunner {
  public currentSessionId: string | null
  public tabId?: string
  private agent?: Agent
  private registry?: ToolRegistry
  private subagentPool = new SubagentPool()
  private cwd?: string
  private personality?: PersonalityName
  private unsubscribe?: () => void
  private eventSink?: (event: AgentEvent) => void
  private requestedModel?: ModelSelection
  private requestedCwd?: string
  private sessionBinding: SessionBinding | null = null
  private activeCapabilities: string[] = getDefaultCapabilities().tools
  private activeMcp: string[] = []
  private activeSkills: LoadedSkill[] = []
  private collaborationMode: "default" | "plan" = "default"
  private builtSignature = ""
  private messageQueue: string[] = []
  private draining = false
  private onSessionCreatedCallback?: (
    runner: AgentSessionRunner,
    oldKey: string,
    newSessionId: string,
  ) => void

  private readonly turnStore: TurnStore
  private readonly compactor: ContextCompactor
  private currentTurnContext?: TurnContext

  constructor(options: SessionRunnerOptions) {
    this.currentSessionId = options.sessionId
    this.tabId = options.tabId
    this.eventSink = options.eventSink
    this.onSessionCreatedCallback = options.onSessionCreated

    this.compactor = new ContextCompactor({
      getAgent: () => this.agent,
      getMessageSeqs: () => this.turnStore.getMessageSeqs(),
      getSessionId: () => this.currentSessionId,
      getRequestedModel: () => this.requestedModel,
      isBusy: () => this.isBusy(),
      emit: (event) => this.emitEvent(event),
    })

    this.turnStore = new TurnStore({
      setSessionId: (sessionId) => this.setSessionId(sessionId),
      getCurrentSessionId: () => this.currentSessionId,
      setSessionBinding: (binding) => {
        this.sessionBinding = binding
      },
      getCwd: () => this.cwd,
      emit: (event) => this.emitEvent(event),
      emitUsage: () => this.compactor.emitUsage(),
    })
  }

  // 统一包装下发事件，自动附带 sessionId 与 tabId 路由字段。
  public emitEvent(event: AgentEvent): void {
    if (!this.eventSink) return
    const enriched: AgentEvent = {
      ...event,
      ...(this.currentSessionId ? { sessionId: this.currentSessionId } : {}),
      ...(this.tabId ? { tabId: this.tabId } : {}),
    } as AgentEvent
    this.eventSink(enriched)
  }

  public setEventSink(sink: (event: AgentEvent) => void): void {
    this.eventSink = sink
  }

  public setSessionId(sessionId: string | null): void {
    if (this.currentSessionId === sessionId) return
    if (this.currentSessionId) {
      permissionManager.clearSession(this.currentSessionId)
      questionManager.clearSession(this.currentSessionId)
      lspManager.clearSession(this.currentSessionId)
      this.subagentPool.clear()
    }
    const oldKey = this.currentSessionId ?? this.tabId ?? "draft"
    this.currentSessionId = sessionId
    if (sessionId === null) {
      this.personality = undefined
    } else if (oldKey && oldKey !== sessionId) {
      this.onSessionCreatedCallback?.(this, oldKey, sessionId)
    }
  }

  public isBusy(): boolean {
    return Boolean(this.agent?.state.isStreaming || this.draining || this.messageQueue.length > 0)
  }

  public getEffectiveCwd(): string | undefined {
    return this.cwd ?? this.requestedCwd ?? resolveCwd()
  }

  public getCurrentSessionId(): string | null {
    return this.currentSessionId
  }

  public getMessages(): AgentMessage[] {
    return this.agent?.state.messages ?? []
  }

  public getActiveTools(): AgentTool<any>[] {
    return this.registry?.getActive() ?? []
  }

  public cleanUp(): void {
    this.abort()
    if (this.currentSessionId) {
      permissionManager.clearSession(this.currentSessionId)
      questionManager.clearSession(this.currentSessionId)
      lspManager.clearSession(this.currentSessionId)
      this.subagentPool.clear()
    }
  }

  private ensureReady(): { agent: Agent } | { error: string } {
    permissionManager.load()
    permissionManager.setMcpTools(this.activeMcp)

    let cwd = this.requestedCwd ?? resolveCwd()

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
      this.turnStore.setMcpToolNames(
        new Map(mcpManager.getTools().map((handle) => [handle.fullName, handle.server])),
      )
      const currentSandboxPolicy = permissionManager.getSandboxPolicy()
      const systemPrompt = buildSystemPromptSync({
        cwd,
        sessionId: this.currentSessionId ?? undefined,
        modelId: modelResult.model.id,
        sandboxPolicy: currentSandboxPolicy,
        collaborationMode: this.collaborationMode,
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
          subagentPool: this.subagentPool,
          beforeToolCall: (context, signal) =>
            permissionManager.gate(context, this.currentSessionId, signal, {
              collaborationMode: this.collaborationMode,
            }),
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
          return permissionManager.gate(context, this.currentSessionId, signal, {
            collaborationMode: this.collaborationMode,
          })
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
        transformContext: async (messages) => {
          const prunedMessages = pruneHistoricalToolOutputs(messages)
          const todoList = this.turnStore.getTodo()
          const todoMessage = todoList.length > 0 ? [createTodoStateMessage(todoList)] : []
          const boundary = this.compactor.getBoundary()
          if (!boundary) return [...todoMessage, ...prunedMessages]
          const messageSeqs = this.turnStore.getMessageSeqs()
          const kept = prunedMessages.filter((_, index) => {
            const seq = messageSeqs[index] ?? -1
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
        this.emitEvent(event)
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

  public freezeNewSession(context: AgentSendContext): void {
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

  private resolveMcpTools(): string[] {
    return mcpManager.getTools().map((handle) => handle.fullName)
  }

  private resolveInjectedSkills(cwd: string): LoadedSkill[] {
    const available = skillLoader.load(cwd).filter((skill) => !skill.disableModelInvocation)
    return [...available].sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_INJECTED_SKILLS)
  }

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

  private enqueueMessage(text: string): AgentSendResult {
    if (this.messageQueue.length >= MAX_QUEUE) {
      return {
        ok: false,
        error: `消息队列已满（最多 ${MAX_QUEUE} 条），请等待当前回复完成后发送。`,
      }
    }
    this.messageQueue.push(text)
    this.emitQueueChanged()
    return {
      ok: true,
      queued: true,
      queueLength: this.messageQueue.length,
      sessionId: this.currentSessionId ?? "",
    }
  }

  private emitQueueChanged(): void {
    this.emitEvent({
      type: "queue_changed",
      length: this.messageQueue.length,
      messages: [...this.messageQueue],
    })
  }

  private clearQueue(): void {
    if (this.messageQueue.length === 0) return
    this.messageQueue = []
    this.emitQueueChanged()
  }

  private async kickDrain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      while (this.messageQueue.length > 0) {
        const text = this.messageQueue.shift()!
        this.emitQueueChanged()
        await this.runOne(text)
      }
    } finally {
      this.draining = false
    }
  }

  public async send(
    text: string,
    selection?: ModelSelection,
    context?: AgentSendContext,
    options?: AgentSendOptions,
  ): Promise<AgentSendResult> {
    if (selection !== undefined) {
      this.requestedModel = selection
    }
    await mcpManager.ensureConnected()
    if (context !== undefined) {
      this.freezeNewSession(context)
    }
    if (options?.personality) {
      this.personality = options.personality
    }

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

    if (this.isBusy()) {
      return this.enqueueMessage(text)
    }
    const ready = this.ensureReady()
    if ("error" in ready) {
      return { ok: false, error: ready.error }
    }
    const result = await this.runOne(text, context?.files, context?.cwd)
    void this.kickDrain()
    return result
  }

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

  private async runOne(
    text: string,
    files?: AttachedFile[],
    overrideCwd?: string,
  ): Promise<AgentSendResult> {
    const agent = this.agent
    if (!agent) {
      return { ok: false, error: "Agent 尚未就绪，请重试。" }
    }
    const isNewSession = !this.currentSessionId
    if (isNewSession) {
      agent.state.messages = []
      this.turnStore.resetSeqs()
      this.compactor.setBoundary(null)
      this.turnStore.resetOverflow()
    }
    const { expanded, command } = this._expandAndDetectCommand(text, overrideCwd)
    this.beginSessionTurn(text)
    this.turnStore.captureSnapshot()

    if (isNewSession && this.turnStore.getSessionInput()) {
      let createResult:
        | {
            sessionId: string
            initialModelMessage?: ModelSwitchMessage
          }
        | undefined
      agentSessionService.transaction(() => {
        createResult = this.turnStore.createSessionIfNeeded(
          this.turnStore.getSessionInput()!,
          new Date().toISOString(),
        )
      })
      if (createResult?.initialModelMessage) {
        agent.state.messages.push(createResult.initialModelMessage)
        this.emitEvent({
          type: "model_switch",
          message: createResult.initialModelMessage,
        })
      }
      if (this.currentSessionId) {
        this.generateTitle(this.currentSessionId, text)
      }
    }

    if (files && files.length > 0 && this.currentSessionId) {
      this.turnStore.setCopiedFiles(this.processPendingFiles(this.currentSessionId, files))
    } else {
      this.turnStore.clearCopiedFiles()
    }

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

      if (this.turnStore.consumeOverflow()) {
        this.removeLastOverflowMessage()
        const compacted = await this.compactor.compactIfNeeded(true)
        if (!compacted) {
          throw new Error("上下文超出模型窗口且自动压缩失败，请新建会话或重试。")
        }
        this.beginSessionTurn(text)
        await agent.continue()
        if (this.turnStore.consumeOverflow()) {
          this.removeLastOverflowMessage()
          throw new Error("上下文压缩后仍超出模型窗口，请新建会话或减少会话长度。")
        }
      } else {
        await this.compactor.compactIfNeeded(false)
      }
    } catch (error) {
      this.discardPendingTurn()
      this.currentTurnContext = undefined
      if (
        isNewSession &&
        this.currentSessionId &&
        !this.turnStore.hasSessionMessages(this.currentSessionId)
      ) {
        const sessionIdToDelete = this.currentSessionId
        agentSessionService.deleteSession(sessionIdToDelete)
        this.setSessionId(null)
        this.sessionBinding = null

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

  public async continue(prompt?: string): Promise<AgentSendResult> {
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
    agent.steer({ role: "user", content: continueText, timestamp: Date.now() })
    this.beginSessionTurn(continueText)
    this.turnStore.captureSnapshot()
    try {
      await agent.continue()
      if (this.turnStore.consumeOverflow()) {
        this.removeLastOverflowMessage()
        throw new Error("上下文超出模型窗口，请新建会话或重试。")
      }
      await this.compactor.compactIfNeeded(false)
    } catch (error) {
      this.discardPendingTurn()
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    void this.kickDrain()
    return { ok: true, sessionId: this.currentSessionId }
  }

  public abort(): void {
    this.agent?.abort()
    this.currentTurnContext = undefined
    this.clearQueue()
  }

  public restoreMessages(messages: AgentMessage[]): void {
    this.discardPendingTurn()
    this.agent?.abort()
    this.clearQueue()
    const ready = this.ensureReady()
    if ("error" in ready) return
    ready.agent.state.messages = [...messages]
    this.turnStore.syncMessageSeqs(messages)
    if (messages.length === 0) {
      this.setSessionId(null)
      this.sessionBinding = null
      this.compactor.setBoundary(null)
      this.turnStore.clearTodo()
    } else if (this.compactor.getBoundary()) {
      const boundary = this.compactor.getBoundary()!
      const keptExists = this.turnStore.getMessageSeqs().some((seq) => seq >= boundary.firstKeptSeq)
      if (!keptExists) this.compactor.setBoundary(null)
    }
    this.compactor.emitUsage()
  }

  public async restoreSessionData(
    sessionId: string,
    messages: AgentMessage[],
    seqs: number[],
    todos: TodoList,
    sessionCwd: string,
    projectId?: string | null,
    page?: string | null,
  ): Promise<void> {
    this.discardPendingTurn()
    this.agent?.abort()
    this.clearQueue()
    await mcpManager.ensureConnected()
    this.setSessionId(sessionId)
    this.sessionBinding = {
      projectId: projectId ?? undefined,
      page: page ?? undefined,
    }
    this.activeCapabilities = getDefaultCapabilities().tools
    this.requestedCwd = sessionCwd
    this.activeMcp = this.resolveMcpTools()
    this.activeSkills = this.resolveInjectedSkills(sessionCwd)
    this.turnStore.loadTodo(todos)

    const ready = this.ensureReady()
    if ("error" in ready) {
      throw new Error(ready.error)
    }
    ready.agent.state.messages = [...messages]
    this.turnStore.setMessageSeqs(seqs)
    this.compactor.loadBoundary(sessionId)
    this.compactor.emitUsage()
  }

  public switchWorktree(path: string): AgentSwitchWorktreeResult {
    if (this.isBusy()) {
      return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
    }
    this.clearQueue()
    this.requestedCwd = path
    if (this.currentSessionId) {
      agentSessionService.updateSessionCwd(this.currentSessionId, path, new Date().toISOString())
    }
    return { ok: true }
  }

  public switchProject(projectId: string, path: string): AgentSwitchProjectResult {
    if (this.isBusy()) {
      return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
    }
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

  public switchModel(
    selection: ModelSelection,
  ): { ok: true; message?: ModelSwitchMessage } | { ok: false; error: string } {
    this.requestedModel = selection
    const sessionId = this.currentSessionId
    if (!sessionId) {
      return { ok: true }
    }

    const family = detectModelFamily(selection.model)
    const instructions = getModelAdaptiveInstructions(family)
    const message: ModelSwitchMessage = {
      role: "modelSwitch",
      provider: selection.provider,
      model: selection.model,
      family,
      instructions,
      timestamp: Date.now(),
      isInitial: false,
    }

    const now = new Date().toISOString()
    agentSessionService.transaction(() => {
      const seq = agentSessionService.nextSeq(sessionId)
      agentSessionService.insertEntry({
        externalId: createExternalId(),
        sessionId,
        seq,
        type: "model_change",
        payload: JSON.stringify(message),
        createdAt: now,
      })
      agentSessionService.touchSession(sessionId, now)
      this.turnStore.getMessageSeqs().push(seq)
    })

    if (this.agent) {
      this.agent.state.messages.push(message)
    }

    this.emitEvent({ type: "model_switch", message })
    return { ok: true, message }
  }

  public setCollaborationMode(mode: "default" | "plan"): { ok: true } {
    this.collaborationMode = mode
    this.builtSignature = ""
    this.emitEvent({ type: "collaboration_mode_changed", mode })
    return { ok: true }
  }

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
      modelSelection: this.requestedModel,
    })
  }

  private discardPendingTurn(): void {
    this.turnStore.discardTurn()
  }

  public getContextUsage(selection?: ModelSelection): AgentContextUsage {
    if (selection) {
      this.requestedModel = selection
    }
    return this.compactor.getUsage(selection)
  }

  public compact(): Promise<AgentCompactResult> {
    return this.compactor.compact()
  }

  public undoCompaction(): Promise<AgentUndoCompactionResult> {
    return this.compactor.undo()
  }

  public async getPromptAssembly(cwd?: string): Promise<PromptAssembly> {
    const targetCwd = cwd ?? this.cwd ?? this.requestedCwd ?? resolveCwd() ?? ""
    const targetSessionId = this.currentSessionId ?? undefined
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

  private removeLastOverflowMessage(): void {
    const messages = this.agent?.state.messages
    if (!messages) return
    while (messages.length > 0 && isOverflowFailure(messages[messages.length - 1])) {
      messages.pop()
    }
  }

  private generateTitle(sessionId: string, userText: string): void {
    this.emitEvent({ type: "session_title", sessionId, title: null })
    void generateSessionTitle([{ role: "user", content: userText, timestamp: Date.now() }]).then(
      (generated) => {
        const session = agentSessionService.getSession(sessionId)
        if (!session) return
        let title = session.title
        if (generated && this.currentSessionId === sessionId) {
          agentSessionService.renameSession(sessionId, generated, new Date().toISOString())
          title = generated
        }
        this.emitEvent({ type: "session_title", sessionId, title })
      },
    )
  }

  public getTurnStore(): TurnStore {
    return this.turnStore
  }

  public getCompactor(): ContextCompactor {
    return this.compactor
  }
}
