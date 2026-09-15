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
import { getSubagentSettings } from "@/services/settingsService"
import { getAppDataRoot } from "../paths"
import { ALL_TOOL_NAMES, buildSystemPromptSync, createRegistry, resolveCwd } from "./assembly"
import { createCompactionSummaryMessage } from "./compaction"
import { pruneHistoricalToolOutputs } from "./compaction/contextPruner"
import { ContextCompactor } from "./contextCompactor"
import { Agent } from "./core/agent"
import { TurnContext } from "./core/turnContext"
import type {
  AfterToolCallContext,
  AfterToolCallResult,
  AgentTool,
  BeforeToolCallContext,
  BeforeToolCallResult,
  ToolHookResult,
} from "./core/types"
import { repeatToolGuard } from "./guard/repeatToolGuard"
import { firstBlock, firstStop, hookResultMessages, hooksManager } from "./hooks"
import { lspManager } from "./lsp/lspManager"
import { mcpManager } from "./mcp/mcpManager"
import { permissionManager } from "./permissions/permissionManager"
import { detectModelFamily, getModelAdaptiveInstructions } from "./prompts/modelAdapters"
import type { PersonalityName } from "./prompts/personalities"
import { defaultSystemPromptManager } from "./prompts/systemPromptManager"
import { questionManager } from "./question/questionManager"
import {
  createTodoStateMessage,
  expandAndDetectCommand,
  processPendingFiles,
  resolveInjectedSkills,
  resolveMcpTools,
} from "./sessionRunnerInput"
import { unifiedExecManager } from "./shell/unifiedExecManager"
import type { LoadedSkill } from "./skills/skillLoader"
import { createAiSdkStreamFn } from "./stream/aiSdkStreamFn"
import { modelSupportsImageInput } from "./stream/modelCapabilities"
import { resolveDefaultModel, resolveModelSelection } from "./stream/modelFactory"
import { SubagentPool } from "./subagent/subagentPool"
import { SubagentRuntime } from "./subagent/subagentRuntime"
import { generateSessionTitle } from "./titleGenerator"
import { ToolRegistry } from "./tools/registry"
import { type AttachedFile, isOverflowFailure, type SessionBinding, TurnStore } from "./turnStore"

// 排队消息上限（流式中入队；超限明确报错，不覆盖、不静默丢）。
const MAX_QUEUE = 20

// 排队消息：文本 + 完整发送上下文（附件/cwd），drain 时与直接发送语义一致。
interface QueuedMessage {
  text: string
  context?: AgentSendContext
}

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
  // 会话级并发槽位：跨嵌套深度共享，registry 重建不重置计数。
  private subagentRuntime?: SubagentRuntime
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
  private collaborationMode: CollaborationMode = "build"
  private builtSignature = ""
  // SessionStart 每个会话只派发一次（会话切换/销毁后重置）。
  private sessionStartFired = false
  private messageQueue: QueuedMessage[] = []
  private draining = false
  // 本会话待附加的重复调用提醒（toolCallId → reminder，afterToolCall 附加后清除）。
  private readonly guardReminders = new Map<string, string>()
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

  // 派发 SessionStart（每个会话一次）与 UserPromptSubmit；提交被拒绝时返回 error。
  private async dispatchPromptHooks(
    prompt: string,
    isNewSession: boolean,
  ): Promise<{ messages: AgentMessage[] } | { error: string }> {
    const messages: AgentMessage[] = []
    if (!this.sessionStartFired) {
      const startResult = await hooksManager.dispatch({
        event: "SessionStart",
        sessionId: this.currentSessionId,
        cwd: this.getEffectiveCwd(),
        model: this.agent?.state.model.id,
        payload: { source: isNewSession ? "startup" : "resume" },
      })
      messages.push(...hookResultMessages(startResult))
      this.sessionStartFired = true
    }

    const submitResult = await hooksManager.dispatch({
      event: "UserPromptSubmit",
      sessionId: this.currentSessionId,
      cwd: this.getEffectiveCwd(),
      model: this.agent?.state.model.id,
      payload: { prompt },
    })
    const stop = firstStop(submitResult)
    if (stop) {
      // 提交被拒绝：SessionStart 视为未发生，允许用户重试。
      this.sessionStartFired = false
      return { error: stop.reason || "Prompt submission was rejected by a hook." }
    }
    messages.push(...hookResultMessages(submitResult))
    return { messages }
  }

  // 重复调用守卫 + 权限门控（主/子代理共用）；提醒暂存到 toolCallId，由 afterToolCall 附加。
  private beforeToolCallWithGuard(
    context: BeforeToolCallContext,
    signal: AbortSignal | undefined,
    collaborationMode: CollaborationMode,
    cwd: string,
  ): Promise<BeforeToolCallResult | undefined> {
    if (this.currentSessionId) {
      const guardResult = repeatToolGuard.record(
        this.currentSessionId,
        context.toolCall.name,
        context.args,
      )
      if (guardResult.blocked) {
        return Promise.resolve({ block: true, reason: guardResult.blockReason })
      }
      if (guardResult.reminder) {
        this.guardReminders.set(context.toolCall.id, guardResult.reminder)
      }
    }
    return permissionManager.gate(context, this.currentSessionId, signal, {
      collaborationMode,
      cwd,
    })
  }

  // 工具结果收尾：附加本调用的重复调用提醒（仅成功结果），随后清除暂存。
  private afterToolCallWithGuard(context: AfterToolCallContext): AfterToolCallResult | undefined {
    const reminder = this.guardReminders.get(context.toolCall.id)
    if (reminder === undefined) return undefined
    this.guardReminders.delete(context.toolCall.id)
    if (context.isError) return undefined
    return { content: [...context.result.content, { type: "text", text: reminder }] }
  }

  // PreToolUse hook 派发（权限解析后）；可阻断并注入审计消息。
  private async dispatchPreToolUse(
    context: BeforeToolCallContext,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<ToolHookResult | undefined> {
    const result = await hooksManager.dispatch({
      event: "PreToolUse",
      sessionId: this.currentSessionId,
      cwd,
      model: this.agent?.state.model.id,
      toolName: context.toolCall.name,
      payload: {
        tool_name: context.toolCall.name,
        tool_input: context.args,
        tool_use_id: context.toolCall.id,
      },
      signal,
    })
    const block = firstBlock(result)
    return {
      ...(block ? { block } : {}),
      messages: hookResultMessages(result),
    }
  }

  // PostToolUse hook 派发：仅注入审计消息。
  private async dispatchPostToolUse(
    context: AfterToolCallContext,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<ToolHookResult | undefined> {
    const toolResponse = context.result.content
      .map((contentBlock) => (contentBlock.type === "text" ? contentBlock.text : "[image]"))
      .join("\n")
    const result = await hooksManager.dispatch({
      event: "PostToolUse",
      sessionId: this.currentSessionId,
      cwd,
      model: this.agent?.state.model.id,
      toolName: context.toolCall.name,
      payload: {
        tool_name: context.toolCall.name,
        tool_input: context.args,
        tool_use_id: context.toolCall.id,
        tool_response: toolResponse,
      },
      signal,
    })
    return { messages: hookResultMessages(result) }
  }

  private ensureReady(): { agent: Agent } | { error: string } {
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
      const currentSandboxPolicy = permissionManager.getSandboxPolicy()
      const contextUsage = this.compactor.getUsage()
      const systemPrompt = buildSystemPromptSync({
        cwd,
        sessionId: this.currentSessionId ?? undefined,
        modelId: modelResult.model.id,
        sandboxPolicy: currentSandboxPolicy,
        collaborationMode: this.collaborationMode,
        contextUsage,
        activeSkills: this.activeSkills,
        personality: this.personality,
      })
      // 会话装配时快照子代理设置：设置保存仅对新会话生效。
      const subagentSettings = getSubagentSettings()
      // 子代理协作模式由设置决定（缺省 build），不继承主 agent 模式。
      const subagentMode = normalizeCollaborationMode(subagentSettings.mode)
      const subagentSystemPrompt = buildSystemPromptSync({
        cwd,
        sessionId: this.currentSessionId ?? undefined,
        modelId: modelResult.model.id,
        sandboxPolicy: currentSandboxPolicy,
        collaborationMode: subagentMode,
        contextUsage,
        activeSkills: this.activeSkills,
        personality: this.personality,
      })
      this.subagentRuntime ??= new SubagentRuntime(subagentSettings.maxConcurrent)
      const registry = createRegistry(
        cwd,
        this.activeCapabilities,
        this.activeMcp,
        this.activeSkills.length > 0,
        {
          subagentSystemPrompt,
          model: modelResult.model,
          sandboxPolicy: currentSandboxPolicy,
          subagentPool: this.subagentPool,
          subagentSettings,
          subagentRuntime: this.subagentRuntime,
          beforeToolCall: (context, signal) =>
            this.beforeToolCallWithGuard(context, signal, subagentMode, cwd),
          afterToolCall: async (context) => this.afterToolCallWithGuard(context),
          preToolUse: (context, signal) => this.dispatchPreToolUse(context, cwd, signal),
          postToolUse: (context, signal) => this.dispatchPostToolUse(context, cwd, signal),
          getCwd: () => this.cwd ?? cwd,
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
        {
          getSessionId: () => this.currentSessionId,
          supportsImages: () =>
            modelSupportsImageInput(modelResult.model.provider, modelResult.model.id),
        },
      )
      const previousMessages = this.agent?.state.messages ?? []
      const agent = new Agent({
        streamFn: createAiSdkStreamFn({
          purpose: "chat",
          getSessionId: () => this.currentSessionId,
        }),
        beforeToolCall: async (context, signal) => {
          this.currentTurnContext?.recordToolCall()
          return this.beforeToolCallWithGuard(context, signal, this.collaborationMode, cwd)
        },
        afterToolCall: async (context) => this.afterToolCallWithGuard(context),
        preToolUse: (context, signal) => this.dispatchPreToolUse(context, cwd, signal),
        postToolUse: (context, signal) => this.dispatchPostToolUse(context, cwd, signal),
        onAgentStop: async () => {
          const messages = this.agent?.state.messages ?? []
          const lastAssistant = [...messages]
            .reverse()
            .find((message) => message.role === "assistant")
          const lastAssistantMessage =
            lastAssistant?.role === "assistant"
              ? lastAssistant.content
                  .filter((block) => block.type === "text")
                  .map((block) => block.text)
                  .join("\n")
              : ""
          const result = await hooksManager.dispatch({
            event: "Stop",
            sessionId: this.currentSessionId,
            cwd: this.cwd,
            model: this.agent?.state.model.id,
            payload: { last_assistant_message: lastAssistantMessage },
          })
          return hookResultMessages(result)
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

  private enqueueMessage(text: string, context?: AgentSendContext): AgentSendResult {
    if (this.messageQueue.length >= MAX_QUEUE) {
      return {
        ok: false,
        error: `消息队列已满（最多 ${MAX_QUEUE} 条），请等待当前回复完成后发送。`,
      }
    }
    this.messageQueue.push({ text, ...(context ? { context } : {}) })
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
      messages: this.messageQueue.map((item) => item.text),
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
        const item = this.messageQueue.shift()!
        this.emitQueueChanged()
        await this.runOne(item.text, item.context?.files, item.context?.cwd)
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
      return this.enqueueMessage(processedText, context)
    }
    const ready = this.ensureReady()
    if ("error" in ready) {
      return { ok: false, error: ready.error }
    }
    const result = await this.runOne(processedText, context?.files, context?.cwd)
    void this.kickDrain()
    return result
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
    const { expanded, command } = expandAndDetectCommand(
      text,
      overrideCwd ?? this.getEffectiveCwd(),
    )
    // 生命周期 hook：SessionStart（每个会话一次）+ UserPromptSubmit（每次提交）。
    const promptHooks = await this.dispatchPromptHooks(expanded, isNewSession)
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
