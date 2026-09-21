import type {
  AgentMessage,
  AgentSwitchProjectResult,
  AgentSwitchWorktreeResult,
  CollaborationMode,
  CollaborationModeSwitchMessage,
  ModelSwitchMessage,
  TodoList,
} from "@shared/contracts/agent"
import { normalizeCollaborationMode } from "@shared/contracts/agent"
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

// 切换协作模式：更新运行时模式并把 modeSwitch 消息落库（mode_change entry），
// 会话尾部连续的切换消息中已有模式条目时原地更新，不新建。
export const switchCollaborationMode = (
  host: SessionRunnerHost,
  mode: CollaborationMode,
): { ok: true } => {
  const normalized = normalizeCollaborationMode(mode)
  const modeChanged = host.collaborationMode !== normalized
  host.collaborationMode = normalized
  host.builtSignature = ""

  const sessionId = host.currentSessionId
  // 会话尚未落库（草稿态仅持有 id）或模式未变化时不写历史：只更新运行时状态并广播模式事件。
  const sessionPersisted = sessionId
    ? agentSessionService.getSession(sessionId) !== undefined
    : false
  if (!sessionId || !sessionPersisted || !modeChanged) {
    host.emitEvent({ type: "collaboration_mode_changed", mode: normalized })
    return { ok: true }
  }

  const message: CollaborationModeSwitchMessage = {
    role: "modeSwitch",
    mode: normalized,
    timestamp: Date.now(),
  }

  const trailing = findTrailingSwitchMessage(host, "modeSwitch")
  if (trailing && trailing.role === "modeSwitch") {
    const previousTimestamp = trailing.timestamp
    Object.assign(trailing, { ...message, isInitial: trailing.isInitial })
    updateSwitchEntryPayload(sessionId, "mode_change", "modeSwitch", previousTimestamp, trailing)
    host.emitEvent({ type: "collaboration_mode_changed", mode: normalized, message: trailing })
    return { ok: true }
  }

  const now = new Date().toISOString()
  let insertedSeq: number | undefined
  agentSessionService.transaction(() => {
    const seq = agentSessionService.nextSeq(sessionId)
    agentSessionService.insertEntry({
      externalId: createExternalId(),
      sessionId,
      seq,
      type: "mode_change",
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
  host.agent?.state.appendMessage(message)
  host.emitEvent({ type: "collaboration_mode_changed", mode: normalized, message })
  return { ok: true }
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

// 切换类消息角色：会话尾部连续出现时按同类合并，避免来回切换刷屏（位置/ID 保持不变）。
const SWITCH_MESSAGE_ROLES = new Set<AgentMessage["role"]>(["modelSwitch", "modeSwitch"])

// 从会话尾部向前扫描连续的切换消息，命中同类时返回该条目（越过非切换消息即停止）。
const findTrailingSwitchMessage = (
  host: SessionRunnerHost,
  role: "modelSwitch" | "modeSwitch",
): ModelSwitchMessage | CollaborationModeSwitchMessage | undefined => {
  const messages = host.agent?.state.messages ?? []
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (!SWITCH_MESSAGE_ROLES.has(message.role)) return undefined
    if (message.role === role) {
      return message as ModelSwitchMessage | CollaborationModeSwitchMessage
    }
  }
  return undefined
}

// 原地更新同一条切换 entry 的 payload（按 role + timestamp 定位，seq 与位置不变）。
const updateSwitchEntryPayload = (
  sessionId: string,
  entryType: "model_change" | "mode_change",
  role: "modelSwitch" | "modeSwitch",
  timestamp: number,
  message: AgentMessage,
): void => {
  const target = agentSessionService
    .listEntries(sessionId)
    .filter((entry) => entry.type === entryType)
    .find((entry) => {
      try {
        const parsed = JSON.parse(entry.payload) as { role?: string; timestamp?: number }
        return parsed.role === role && parsed.timestamp === timestamp
      } catch {
        return false
      }
    })
  if (!target) return
  agentSessionService.updateEntryPayload(target.external_id, JSON.stringify(message))
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

  // 连续切换合并：会话尾部连续切换消息中已有模型切换条目时，原地更新消息与落库 payload。
  const trailing = findTrailingSwitchMessage(host, "modelSwitch")
  if (trailing && trailing.role === "modelSwitch") {
    const previousTimestamp = trailing.timestamp
    const merged: ModelSwitchMessage = { ...message, isInitial: trailing.isInitial }
    Object.assign(trailing, merged)
    updateSwitchEntryPayload(sessionId, "model_change", "modelSwitch", previousTimestamp, trailing)
    host.emitEvent({ type: "model_switch", message: trailing })
    return { ok: true, message: trailing }
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
