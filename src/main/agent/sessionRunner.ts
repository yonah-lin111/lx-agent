import { existsSync, rmSync } from "node:fs"
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
  CollaborationMode,
  ModelSwitchMessage,
  PromptAssembly,
  TodoList,
  UserMessage,
} from "@shared/contracts/agent"
import { normalizeCollaborationMode } from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import { agentSessionService, createExternalId } from "@/services/agentSessionService"
import { getDefaultCapabilities } from "@/services/capabilityService"
import { projectService } from "@/services/projectService"
import { getAppDataRoot } from "../paths"
import type { QueuedMessage, SessionRunnerOptions } from "./sessionRunner.types"
import { buildSessionAgent } from "./sessionRunnerAgentFactory"
import { clearQueue, enqueueMessage, kickDrain } from "./sessionRunnerQueue"
import { dispatchPromptHooks } from "./sessionRunnerToolHooks"

export type { SessionRunnerOptions } from "./sessionRunner.types"

import { ALL_TOOL_NAMES, buildSystemPromptSync, resolveCwd } from "./assembly"
import { ContextCompactor } from "./contextCompactor"
import { Agent } from "./core/agent"
import { TurnContext } from "./core/turnContext"
import type { AgentTool } from "./core/types"
import { hooksManager } from "./hooks"
import { lspManager } from "./lsp/lspManager"
import { mcpManager } from "./mcp/mcpManager"
import { permissionManager } from "./permissions/permissionManager"
import { detectModelFamily, getModelAdaptiveInstructions } from "./prompts/modelAdapters"
import type { PersonalityName } from "./prompts/personalities"
import { defaultSystemPromptManager } from "./prompts/systemPromptManager"
import { questionManager } from "./question/questionManager"
import {
  expandAndDetectCommand,
  processPendingFiles,
  resolveInjectedSkills,
  resolveMcpTools,
} from "./sessionRunnerInput"
import { unifiedExecManager } from "./shell/unifiedExecManager"
import type { LoadedSkill } from "./skills/skillLoader"
import { resolveDefaultModel, resolveModelSelection } from "./stream/modelFactory"
import { SubagentPool } from "./subagent/subagentPool"
import { SubagentRuntime } from "./subagent/subagentRuntime"
import { generateSessionTitle } from "./titleGenerator"
import { ToolRegistry } from "./tools/registry"
import { type AttachedFile, isOverflowFailure, type SessionBinding, TurnStore } from "./turnStore"

/**
 * 单会话 Agent 实例运行器：负责单个会话/标签页的状态机循环、工具注册、上下文管理与事件分发。
 */
export class AgentSessionRunner {
  public currentSessionId: string | null
  public tabId?: string
  // 内部协作面：由 sessionRunnerAgentFactory / 工具守卫模块共享。
  public agent?: Agent
  private registry?: ToolRegistry
  public subagentPool = new SubagentPool()
  // 会话级并发槽位：跨嵌套深度共享，registry 重建不重置计数。
  public subagentRuntime?: SubagentRuntime
  public cwd?: string
  public personality?: PersonalityName
  private unsubscribe?: () => void
  private eventSink?: (event: AgentEvent) => void
  public requestedModel?: ModelSelection
  public requestedCwd?: string
  public sessionBinding: SessionBinding | null = null
  public activeCapabilities: string[] = getDefaultCapabilities().tools
  public activeMcp: string[] = []
  public activeSkills: LoadedSkill[] = []
  public collaborationMode: CollaborationMode = "build"
  public builtSignature = ""
  // 内部协作面：SessionStart 每个会话只派发一次（会话切换/销毁后重置）。
  public sessionStartFired = false
  // 内部协作面：排队状态由 sessionRunnerQueue 模块读写（禁止外部调用）。
  public messageQueue: QueuedMessage[] = []
  public draining = false
  // 内部协作面：重复调用提醒（toolCallId → reminder，afterToolCall 附加后清除）。
  public readonly guardReminders = new Map<string, string>()
  private onSessionCreatedCallback?: (
    runner: AgentSessionRunner,
    oldKey: string,
    newSessionId: string,
  ) => void

  public readonly turnStore: TurnStore
  public readonly compactor: ContextCompactor
  public currentTurnContext?: TurnContext

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
      getCwd: () => this.cwd,
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
      unifiedExecManager.clearSession(this.currentSessionId)
      this.subagentPool.clear()
    }
    this.guardReminders.clear()
    const oldKey = this.currentSessionId ?? this.tabId ?? "draft"
    const switchedSession =
      sessionId === null || (this.currentSessionId !== null && this.currentSessionId !== sessionId)
    this.currentSessionId = sessionId
    // 会话切换/清空重置 SessionStart；null → 新会话创建不重置（同一 run 内已派发）。
    if (switchedSession) {
      this.sessionStartFired = false
    }
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
      unifiedExecManager.clearSession(this.currentSessionId)
      this.subagentPool.clear()
    }
    this.guardReminders.clear()
  }

  // 会话销毁：best-effort 派发 SessionEnd（不等待异步工作），再清理运行态。
  public dispose(reason: "quit" | "dispose"): void {
    const sessionId = this.currentSessionId
    if (sessionId) {
      void hooksManager.dispatchBestEffort({
        event: "SessionEnd",
        sessionId,
        cwd: this.getEffectiveCwd(),
        payload: { reason },
      })
    }
    this.cleanUp()
    this.sessionStartFired = false
  }

  // 内部协作面：会话装配与就绪检查（实现含 sessionRunnerAgentFactory）。
  public ensureReady(): { agent: Agent } | { error: string } {
    permissionManager.load()
    permissionManager.setMcpTools(this.currentSessionId, this.activeMcp)

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

    if (cwd) {
      this.activeSkills = resolveInjectedSkills(cwd)
    }

    const capabilitiesSignature = JSON.stringify([
      this.activeCapabilities,
      this.activeMcp,
      this.activeSkills.map((skill) => skill.name),
      this.personality,
      this.collaborationMode,
    ])
    if (
      !this.agent ||
      !this.registry ||
      this.cwd !== cwd ||
      capabilitiesSignature !== this.builtSignature ||
      this.agent.state.model.provider !== modelResult.model.provider ||
      this.agent.state.model.id !== modelResult.model.id ||
      this.agent.state.model.variant !== modelResult.model.variant
    ) {
      this.turnStore.setMcpToolNames(
        new Map(mcpManager.getTools().map((handle) => [handle.fullName, handle.server])),
      )
      const { agent, registry, subagentRuntime } = buildSessionAgent(this, {
        cwd,
        model: modelResult.model,
        sandboxPolicy: permissionManager.getSandboxPolicy(),
        contextUsage: this.compactor.getUsage(),
        activeCapabilities: this.activeCapabilities,
        activeMcp: this.activeMcp,
        activeSkills: this.activeSkills,
        personality: this.personality,
      })
      this.subagentRuntime = subagentRuntime
      const previousMessages = this.agent?.state.messages ?? []
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
      const contextUsage = this.compactor.getUsage()
      this.agent.state.model = modelResult.model
      this.agent.state.systemPrompt = buildSystemPromptSync({
        cwd,
        sessionId: this.currentSessionId ?? undefined,
        modelId: modelResult.model.id,
        sandboxPolicy: currentSandboxPolicy,
        collaborationMode: this.collaborationMode,
        contextUsage,
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
    this.activeMcp = resolveMcpTools()
    this.activeSkills = cwd ? resolveInjectedSkills(cwd) : []
  }

  public async send(
    text: string,
    selection?: ModelSelection,
    context?: AgentSendContext,
    options?: AgentSendOptions,
  ): Promise<AgentSendResult> {
    if (selection !== undefined) {
      this.requestedModel = selection
      if (this.agent) {
        this.agent.state.model = {
          provider: selection.provider,
          id: selection.model,
          ...(selection.variant ? { variant: selection.variant } : {}),
        }
      }
    }
    await mcpManager.ensureConnected()
    if (context !== undefined) {
      this.freezeNewSession(context)
    }
    if (options?.personality) {
      this.personality = options.personality
    }

    let processedText = text
    if (
      options?.delivery === "steer" ||
      processedText.startsWith("/steer ") ||
      processedText === "/steer"
    ) {
      if (processedText.startsWith("/steer")) {
        processedText = processedText.slice(6).trim()
      }
      processedText = processedText.replace(/^[\[【]([\s\S]*?)[\]】]$/, "$1").trim()
    }

    if (options?.delivery === "steer" && this.agent?.state.isStreaming) {
      const isNewSession = !this.currentSessionId
      if (!isNewSession && this.currentSessionId) {
        const { expanded, command } = expandAndDetectCommand(
          processedText,
          context?.cwd ?? this.getEffectiveCwd(),
        )
        const steerMessage: UserMessage = {
          role: "user",
          content: expanded,
          timestamp: Date.now(),
          isSteer: true,
          command: command ?? { name: "steer", kind: "builtin" },
        }
        if (context?.files && context.files.length > 0) {
          steerMessage.files = processPendingFiles(this.currentSessionId, context.files)
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
      return enqueueMessage(this, processedText, context)
    }
    const ready = this.ensureReady()
    if ("error" in ready) {
      return { ok: false, error: ready.error }
    }
    const result = await this.runOne(processedText, context?.files, context?.cwd)
    void kickDrain(this)
    return result
  }

  // 轮次执行入口：队列 drain 与 send 共用（实现随后续增量搬移至 sessionRunnerTurns.ts）。
  public async runOne(
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
    const { expanded, command } = expandAndDetectCommand(
      text,
      overrideCwd ?? this.getEffectiveCwd(),
    )
    // 生命周期 hook：SessionStart（每个会话一次）+ UserPromptSubmit（每次提交）。
    const promptHooks = await dispatchPromptHooks(this, expanded, isNewSession)
    if ("error" in promptHooks) {
      return { ok: false, error: promptHooks.error }
    }
    this.beginSessionTurn(text)
    this.turnStore.captureSnapshot()

    if (isNewSession && this.turnStore.getSessionInput()) {
      let createResult:
        | {
            sessionId: string
            initialModelMessage?: ModelSwitchMessage
            initialModelSeq?: number
          }
        | undefined
      agentSessionService.transaction(() => {
        createResult = this.turnStore.createSessionIfNeeded(
          this.turnStore.getSessionInput()!,
          new Date().toISOString(),
        )
      })
      // 事务提交成功后再对齐内存 seq（回滚不得留下幽灵 seq）。
      if (createResult?.initialModelSeq !== undefined) {
        this.turnStore.appendMessageSeq(createResult.initialModelSeq)
      }
      if (createResult?.initialModelMessage) {
        agent.state.appendMessage(createResult.initialModelMessage)
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
      this.turnStore.setCopiedFiles(processPendingFiles(this.currentSessionId, files))
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
      collaborationMode: this.collaborationMode,
    })

    try {
      const currentSandboxPolicy = permissionManager.getSandboxPolicy()
      const contextUsage = this.compactor.getUsage()
      agent.state.systemPrompt = buildSystemPromptSync({
        cwd: this.currentTurnContext.snapshot.cwd,
        sessionId: this.currentSessionId ?? undefined,
        modelId: agent.state.model.id,
        sandboxPolicy: currentSandboxPolicy,
        collaborationMode: this.collaborationMode,
        contextUsage,
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
      // hook 注入消息先于本轮用户消息落位。
      await agent.prompt(
        promptHooks.messages.length > 0 ? [...promptHooks.messages, userMessage] : userMessage,
      )

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
    void kickDrain(this)
    return { ok: true, sessionId: this.currentSessionId }
  }

  public abort(): void {
    this.agent?.abort()
    this.currentTurnContext = undefined
    clearQueue(this)
  }

  public restoreMessages(messages: AgentMessage[]): void {
    this.discardPendingTurn()
    this.agent?.abort()
    clearQueue(this)
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
    clearQueue(this)
    await mcpManager.ensureConnected()
    this.setSessionId(sessionId)
    this.sessionBinding = {
      projectId: projectId ?? undefined,
      page: page ?? undefined,
    }
    this.activeCapabilities = getDefaultCapabilities().tools
    this.requestedCwd = sessionCwd
    this.activeMcp = resolveMcpTools()
    this.activeSkills = resolveInjectedSkills(sessionCwd)
    this.turnStore.loadTodo(todos)

    const lastModelSwitch = [...messages]
      .reverse()
      .find((m): m is ModelSwitchMessage => m.role === "modelSwitch")
    if (lastModelSwitch) {
      this.requestedModel = {
        provider: lastModelSwitch.provider,
        model: lastModelSwitch.model,
        ...(lastModelSwitch.variant ? { variant: lastModelSwitch.variant } : {}),
      }
    }

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
    clearQueue(this)
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
    clearQueue(this)
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
    const prevModel = this.requestedModel
    this.requestedModel = selection

    if (this.agent) {
      this.agent.state.model = {
        provider: selection.provider,
        id: selection.model,
        ...(selection.variant ? { variant: selection.variant } : {}),
      }
    }

    const sessionId = this.currentSessionId
    if (!sessionId) {
      return { ok: true }
    }

    // 若仅切换 variant 而 provider 与 model 均未变，不插入 model_change 历史与 modelSwitch 消息
    const isModelUnchanged =
      prevModel && prevModel.provider === selection.provider && prevModel.model === selection.model
    if (isModelUnchanged) {
      return { ok: true }
    }

    const family = detectModelFamily(selection.model)
    const instructions = getModelAdaptiveInstructions(family)
    const message: ModelSwitchMessage = {
      role: "modelSwitch",
      provider: selection.provider,
      model: selection.model,
      variant: selection.variant,
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
      this.agent.state.appendMessage(message)
    }

    this.emitEvent({ type: "model_switch", message })
    return { ok: true, message }
  }

  public setCollaborationMode(mode: CollaborationMode): { ok: true } {
    this.collaborationMode = normalizeCollaborationMode(mode)
    this.builtSignature = ""
    this.emitEvent({ type: "collaboration_mode_changed", mode: this.collaborationMode })
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
    const contextUsage = this.compactor.getUsage()

    const assembly = await defaultSystemPromptManager.assemble({
      cwd: targetCwd,
      sessionId: targetSessionId,
      modelId,
      sandboxPolicy: currentSandboxPolicy,
      collaborationMode: this.collaborationMode,
      contextUsage,
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
    const state = this.agent?.state
    if (!state) return
    while (
      state.messages.length > 0 &&
      isOverflowFailure(state.messages[state.messages.length - 1])
    ) {
      state.removeLastMessage()
    }
  }

  private generateTitle(sessionId: string, userText: string): void {
    this.emitEvent({ type: "session_title", sessionId, title: null })
    void generateSessionTitle(
      [{ role: "user", content: userText, timestamp: Date.now() }],
      sessionId,
    ).then((generated) => {
      const session = agentSessionService.getSession(sessionId)
      if (!session) return
      let title = session.title
      if (generated && this.currentSessionId === sessionId) {
        agentSessionService.renameSession(sessionId, generated, new Date().toISOString())
        title = generated
      }
      this.emitEvent({ type: "session_title", sessionId, title })
    })
  }

  public getTurnStore(): TurnStore {
    return this.turnStore
  }

  public getCompactor(): ContextCompactor {
    return this.compactor
  }
}
