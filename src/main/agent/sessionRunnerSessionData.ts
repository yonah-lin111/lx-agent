import type {
  AgentMessage,
  AgentSwitchProjectResult,
  AgentSwitchWorktreeResult,
  ModelSwitchMessage,
  TodoList,
} from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import { agentSessionService, createExternalId } from "@/services/agentSessionService"
import { getDefaultCapabilities } from "@/services/capabilityService"
import { mcpManager } from "./mcp/mcpManager"
import { detectModelFamily, getModelAdaptiveInstructions } from "./prompts/modelAdapters"
import type { SessionRunnerHost } from "./sessionRunner.types"
import { resolveInjectedSkills, resolveMcpTools } from "./sessionRunnerInput"
import { clearQueue } from "./sessionRunnerQueue"
import { discardPendingTurn } from "./sessionRunnerTurns"

// 用给定消息整体替换当前会话上下文（撤销/恢复共用）。
export const restoreMessages = (host: SessionRunnerHost, messages: AgentMessage[]): void => {
  discardPendingTurn(host)
  host.agent?.abort()
  clearQueue(host)
  const ready = host.ensureReady()
  if ("error" in ready) return
  ready.agent.state.messages = [...messages]
  host.turnStore.syncMessageSeqs(messages)
  if (messages.length === 0) {
    host.setSessionId(null)
    host.sessionBinding = null
    host.compactor.setBoundary(null)
    host.turnStore.clearTodo()
  } else if (host.compactor.getBoundary()) {
    const boundary = host.compactor.getBoundary()!
    const keptExists = host.turnStore.getMessageSeqs().some((seq) => seq >= boundary.firstKeptSeq)
    if (!keptExists) host.compactor.setBoundary(null)
  }
  host.compactor.emitUsage()
}

// 恢复历史会话：绑定、能力快照、模型与消息序列整体加载，失败抛出具体原因。
export const restoreSessionData = async (
  host: SessionRunnerHost,
  sessionId: string,
  messages: AgentMessage[],
  seqs: number[],
  todos: TodoList,
  sessionCwd: string,
  projectId?: string | null,
  page?: string | null,
): Promise<void> => {
  discardPendingTurn(host)
  host.agent?.abort()
  clearQueue(host)
  await mcpManager.ensureConnected()
  host.setSessionId(sessionId)
  host.sessionBinding = {
    projectId: projectId ?? undefined,
    page: page ?? undefined,
  }
  host.activeCapabilities = getDefaultCapabilities().tools
  host.requestedCwd = sessionCwd
  host.activeMcp = resolveMcpTools()
  host.activeSkills = resolveInjectedSkills(sessionCwd)
  host.turnStore.loadTodo(todos)

  const lastModelSwitch = [...messages]
    .reverse()
    .find((m): m is ModelSwitchMessage => m.role === "modelSwitch")
  if (lastModelSwitch) {
    host.requestedModel = {
      provider: lastModelSwitch.provider,
      model: lastModelSwitch.model,
      ...(lastModelSwitch.variant ? { variant: lastModelSwitch.variant } : {}),
    }
  }

  const ready = host.ensureReady()
  if ("error" in ready) {
    throw new Error(ready.error)
  }
  ready.agent.state.messages = [...messages]
  host.turnStore.setMessageSeqs(seqs)
  host.compactor.loadBoundary(sessionId)
  host.compactor.emitUsage()
}

// 切换工作区目录：清理排队消息并同步会话 cwd。
export const switchWorktree = (
  host: SessionRunnerHost,
  path: string,
): AgentSwitchWorktreeResult => {
  if (host.isBusy()) {
    return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
  }
  clearQueue(host)
  host.requestedCwd = path
  if (host.currentSessionId) {
    agentSessionService.updateSessionCwd(host.currentSessionId, path, new Date().toISOString())
  }
  return { ok: true }
}

// 切换项目绑定：更新 binding 与持久化项目 id / cwd。
export const switchProject = (
  host: SessionRunnerHost,
  projectId: string,
  path: string,
): AgentSwitchProjectResult => {
  if (host.isBusy()) {
    return { ok: false, error: "Agent 正在处理中，请等待完成或点击停止。" }
  }
  clearQueue(host)
  host.requestedCwd = path
  const normalizedProjectId = projectId || undefined
  if (host.sessionBinding) {
    host.sessionBinding.projectId = normalizedProjectId
  } else {
    host.sessionBinding = { projectId: normalizedProjectId }
  }
  if (host.currentSessionId) {
    agentSessionService.updateSessionProject(
      host.currentSessionId,
      normalizedProjectId ?? null,
      path,
      new Date().toISOString(),
    )
  }
  return { ok: true }
}

// 切换会话模型：落库 model_change entry 并插入 modelSwitch 消息（仅 variant 变化时不落库）。
export const switchModel = (
  host: SessionRunnerHost,
  selection: ModelSelection,
): { ok: true; message?: ModelSwitchMessage } | { ok: false; error: string } => {
  const prevModel = host.requestedModel
  host.requestedModel = selection

  if (host.agent) {
    host.agent.state.model = {
      provider: selection.provider,
      id: selection.model,
      ...(selection.variant ? { variant: selection.variant } : {}),
    }
  }

  const sessionId = host.currentSessionId
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
  let insertedSeq: number | undefined
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
    insertedSeq = seq
  })
  // 事务提交成功后再对齐内存 seq（回滚不得留下幽灵 seq）。
  if (insertedSeq !== undefined) {
    host.turnStore.getMessageSeqs().push(insertedSeq)
  }

  if (host.agent) {
    host.agent.state.appendMessage(message)
  }

  host.emitEvent({ type: "model_switch", message })
  return { ok: true, message }
}
