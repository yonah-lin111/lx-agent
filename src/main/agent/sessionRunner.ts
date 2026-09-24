import { existsSync } from "node:fs"
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
import type { ModelSelection } from "@shared/settings"
import { agentSessionService } from "@/services/agentSessionService"
import { getDefaultCapabilities } from "@/services/capabilityService"
import { projectService } from "@/services/projectService"
import type { QueuedMessage, SessionRunnerOptions } from "./sessionRunner.types"
import { buildSessionAgent, getPromptAssembly } from "./sessionRunnerAgentFactory"
import { cleanUp, dispose, freezeNewSession } from "./sessionRunnerLifecycle"
import { clearQueue, enqueueMessage, kickDrain } from "./sessionRunnerQueue"
import {
  restoreMessages,
  restoreSessionData,
  switchCollaborationMode,
  switchEffectiveMode,
  switchModel,
  switchProject,
  switchWorktree,
} from "./sessionRunnerSessionData"
import { continueChat, runSessionTurn } from "./sessionRunnerTurns"

export type { SessionRunnerOptions } from "./sessionRunner.types"

import { buildSystemPromptSync, resolveConnectedMcpServers, resolveCwd } from "./assembly"
import { ContextCompactor } from "./contextCompactor"
import { Agent } from "./core/agent"
import { TurnContext } from "./core/turnContext"
import type { AgentTool } from "./core/types"
import { lspManager } from "./lsp/lspManager"
import { mcpManager } from "./mcp/mcpManager"
import { modeExitManager } from "./mode/modeExitManager"
import { permissionManager } from "./permissions/permissionManager"
import type { PersonalityName } from "./prompts/personalities"
import { questionManager } from "./question/questionManager"
import {
  expandAndDetectCommand,
  processPendingFiles,
  resolveInjectedSkills,
} from "./sessionRunnerInput"
import { unifiedExecManager } from "./shell/unifiedExecManager"
import type { LoadedSkill } from "./skills/skillLoader"
import { resolveDefaultModel, resolveModelSelection } from "./stream/modelFactory"
import { SubagentPool } from "./subagent/subagentPool"
import { SubagentRuntime } from "./subagent/subagentRuntime"
import { ToolRegistry } from "./tools/registry"
import { type AttachedFile, type SessionBinding, TurnStore } from "./turnStore"

/**
 * 单会话 Agent 实例运行器：负责单个会话/标签页的状态机循环、工具注册、上下文管理与事件分发。
 */
export class AgentSessionRunner {
  public currentSessionId: string | null
  public tabId?: string
  // 内部协作面：由 sessionRunnerAgentFactory / 工具守卫模块共享。
  public agent?: Agent
  // 内部协作面：工具注册表由装配工厂创建，供提示组装只读使用。
  public registry?: ToolRegistry
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
  // auto 编排下模型切出的有效模式；非 auto 恒等于 collaborationMode。
  public effectiveMode: CollaborationMode = "build"
  public builtSignature = ""
  // 内部协作面：SessionStart 每个会话只派发一次（会话切换/销毁后重置）。
  public sessionStartFired = false
  // 内部协作面：排队状态由 sessionRunnerQueue 模块读写（禁止外部调用）。
  public messageQueue: QueuedMessage[] = []
  public draining = false
  // 启动窗口标记：runOne 从入口（hook/建会话等 await）到 run 结束始终保持 true。
  // 并发 send 在 isBusy 尚未感知流式前会命中该标记并转入队列，避免互相清空 turn。
  public runOneActive = false
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
    // 新会话启动协作模式：读取权限配置默认值（缺省 build）。
    permissionManager.load()
    this.collaborationMode = permissionManager.getDefaultCollaborationMode()
    this.effectiveMode = this.collaborationMode === "auto" ? "build" : this.collaborationMode

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
      modeExitManager.clearSession(this.currentSessionId)
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
    cleanUp(this)
  }

  public dispose(reason: "quit" | "dispose"): void {
    dispose(this, reason)
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
      this.effectiveMode,
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
        effectiveCollaborationMode: this.effectiveMode,
        contextUsage,
        activeSkills: this.activeSkills,
        mcpServers: resolveConnectedMcpServers(),
        personality: this.personality,
      })
    }

    return { agent: this.agent }
  }

  public freezeNewSession(context: AgentSendContext): void {
    freezeNewSession(this, context)
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

    // runOneActive 覆盖 isBusy 尚未感知流式的启动窗口：并发 send 一律入队，
    // 否则第二个 runOne 会覆盖第一个的 turn 状态（消息与持久化双丢）。
    if (this.isBusy() || this.runOneActive) {
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

  // 轮次执行入口：队列 drain 与 send 共用（实现见 sessionRunnerTurns.ts）。
  public async runOne(
    text: string,
    files?: AttachedFile[],
    overrideCwd?: string,
  ): Promise<AgentSendResult> {
    this.runOneActive = true
    try {
      return await runSessionTurn(this, text, files, overrideCwd)
    } finally {
      this.runOneActive = false
    }
  }

  public async continue(prompt?: string): Promise<AgentSendResult> {
    return continueChat(this, prompt)
  }

  public abort(): void {
    this.agent?.abort()
    this.currentTurnContext = undefined
    clearQueue(this)
  }

  public restoreMessages(messages: AgentMessage[]): void {
    restoreMessages(this, messages)
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
    return restoreSessionData(this, sessionId, messages, seqs, todos, sessionCwd, projectId, page)
  }

  public switchWorktree(path: string): AgentSwitchWorktreeResult {
    return switchWorktree(this, path)
  }

  public switchProject(projectId: string, path: string): AgentSwitchProjectResult {
    return switchProject(this, projectId, path)
  }

  public switchModel(
    selection: ModelSelection,
  ): { ok: true; message?: ModelSwitchMessage } | { ok: false; error: string } {
    return switchModel(this, selection)
  }

  public setCollaborationMode(mode: CollaborationMode): { ok: true } {
    return switchCollaborationMode(this, mode)
  }

  public setEffectiveMode(mode: CollaborationMode): { ok: true } | { ok: false; error: string } {
    return switchEffectiveMode(this, mode)
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
    return getPromptAssembly(this, cwd)
  }

  public getTurnStore(): TurnStore {
    return this.turnStore
  }

  public getCompactor(): ContextCompactor {
    return this.compactor
  }
}
