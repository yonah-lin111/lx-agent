import type {
  AgentMessage,
  AgentSwitchProjectResult,
  AgentSwitchWorktreeResult,
  CollaborationMode,
  CollaborationModeSwitchMessage,
  ModelSwitchMessage,
  TodoList,
} from "@shared/contracts/agent"
import { normalizeCollaborationMode, SWITCH_MODE_TARGETS } from "@shared/contracts/agent"
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

// 切换协作模式（基础模式，用户动作）：同步有效模式（auto 缺省 build）、清除挂起审批并落 mode_change 条目。
export const switchCollaborationMode = (
  host: SessionRunnerHost,
  mode: CollaborationMode,
): { ok: true } => {
  const normalized = normalizeCollaborationMode(mode)
  const nextEffective = normalized === "auto" ? "build" : normalized
  const previousMode = host.collaborationMode
  const changed = host.collaborationMode !== normalized || host.effectiveMode !== nextEffective
  host.collaborationMode = normalized
  host.effectiveMode = nextEffective
  host.builtSignature = ""
  host.rebuildSystemPrompt?.()
  if (!changed) {
    emitModeChanged(host)
    return { ok: true }
  }
  commitModeChange(host, normalized, { from: previousMode })
  return { ok: true }
}

/**
 * auto 编排下重置有效模式（卡片采纳路径统一入口）：
 * 基础模式为 auto 时仅更新有效模式并落 viaAuto 条目；非 auto 时等价于基础模式切换。
 */
export const switchEffectiveMode = (
  host: SessionRunnerHost,
  mode: CollaborationMode,
): { ok: true } | { ok: false; error: string } => {
  const normalized = normalizeCollaborationMode(mode)
  if (!SWITCH_MODE_TARGETS.includes(normalized as (typeof SWITCH_MODE_TARGETS)[number])) {
    return { ok: false, error: `Collaboration mode "${mode}" cannot be set as an effective mode.` }
  }
  if (host.collaborationMode !== "auto") {
    return switchCollaborationMode(host, normalized)
  }
  const previousMode = host.effectiveMode
  const changed = host.effectiveMode !== normalized
  host.effectiveMode = normalized
  host.builtSignature = ""
  host.rebuildSystemPrompt?.()
  if (!changed) {
    emitModeChanged(host)
    return { ok: true }
  }
  commitModeChange(host, normalized, { viaAuto: true, from: previousMode })
  return { ok: true }
}

// 广播模式状态（基础模式 + 有效模式）。
const emitModeChanged = (
  host: SessionRunnerHost,
  options?: {
    message?: CollaborationModeSwitchMessage
    removedMessage?: CollaborationModeSwitchMessage
  },
): void => {
  host.emitEvent({
    type: "collaboration_mode_changed",
    mode: host.collaborationMode,
    effectiveMode: host.effectiveMode,
    ...(options?.message ? { message: options.message } : {}),
    ...(options?.removedMessage ? { removedMessage: options.removedMessage } : {}),
  })
}

// 落 mode_change 条目并广播：尾部连续切换原地合并；用户切回运行起点模式时整条撤销；草稿态只广播。
const commitModeChange = (
  host: SessionRunnerHost,
  mode: CollaborationMode,
  options: { viaAuto?: boolean; from?: CollaborationMode },
): void => {
  const sessionId = host.currentSessionId
  const sessionPersisted = sessionId
    ? agentSessionService.getSession(sessionId) !== undefined
    : false
  if (!sessionId || !sessionPersisted) {
    emitModeChanged(host)
    return
  }

  const message: CollaborationModeSwitchMessage = {
    role: "modeSwitch",
    mode,
    timestamp: Date.now(),
    ...(options.from !== undefined ? { from: options.from } : {}),
    ...(options.viaAuto ? { viaAuto: true } : {}),
  }

  const trailing = findTrailingSwitchEntry(host, "modeSwitch")
  if (trailing && trailing.message.role === "modeSwitch") {
    // 用户切回本条连续切换运行开始前的模式：整条 run 净效果为零，移除已添加的条目（不入库、不留痕）。
    if (
      !options.viaAuto &&
      !trailing.message.viaAuto &&
      !trailing.message.isInitial &&
      trailing.message.from !== undefined &&
      trailing.message.from === mode
    ) {
      removeTrailingSwitchMessage(host, trailing.message, trailing.index)
      emitModeChanged(host, { removedMessage: trailing.message })
      return
    }
    const previousTimestamp = trailing.message.timestamp
    // 旧数据（缺 from）保持缺省：run 起点未知，合并后仍不可撤销。
    const runFrom = trailing.message.from
    Object.assign(trailing.message, { ...message, isInitial: trailing.message.isInitial })
    // Object.assign 不删除键：合并保留本条 run 的起点模式与清除上一条 viaAuto 标记。
    if (runFrom !== undefined) trailing.message.from = runFrom
    else delete trailing.message.from
    if (message.viaAuto === undefined) delete trailing.message.viaAuto
    updateSwitchEntryPayload(
      sessionId,
      "mode_change",
      "modeSwitch",
      previousTimestamp,
      trailing.message,
    )
    emitModeChanged(host, { message: trailing.message })
    return
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
  emitModeChanged(host, { message })
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

// 从会话尾部向前扫描连续的切换消息，命中同类时返回该条目及其下标（越过非切换消息即停止）。
const findTrailingSwitchEntry = (
  host: SessionRunnerHost,
  role: "modelSwitch" | "modeSwitch",
): { message: ModelSwitchMessage | CollaborationModeSwitchMessage; index: number } | undefined => {
  const messages = host.agent?.state.messages ?? []
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (!SWITCH_MESSAGE_ROLES.has(message.role)) return undefined
    if (message.role === role) {
      return {
        message: message as ModelSwitchMessage | CollaborationModeSwitchMessage,
        index,
      }
    }
  }
  return undefined
}

// 从会话尾部向前扫描连续的切换消息，命中同类时返回该条目（越过非切换消息即停止）。
const findTrailingSwitchMessage = (
  host: SessionRunnerHost,
  role: "modelSwitch" | "modeSwitch",
): ModelSwitchMessage | CollaborationModeSwitchMessage | undefined =>
  findTrailingSwitchEntry(host, role)?.message

// 撤销尾部连续切换记录：同步移除内存消息与 seq 对齐，并删除对应 DB entry（切回原模式，不留历史痕迹）。
const removeTrailingSwitchMessage = (
  host: SessionRunnerHost,
  message: CollaborationModeSwitchMessage,
  index: number,
): void => {
  host.agent?.state.removeMessageAt(index)
  const seqs = host.turnStore.getMessageSeqs()
  if (seqs.length > index) seqs.splice(index, 1)
  const sessionId = host.currentSessionId
  if (sessionId) {
    deleteSwitchEntry(sessionId, "mode_change", "modeSwitch", message.timestamp)
  }
}

// 按 role + timestamp 定位切换 entry（payload 原地更新与撤销删除共用）。
const findSwitchEntry = (
  sessionId: string,
  entryType: "model_change" | "mode_change",
  role: "modelSwitch" | "modeSwitch",
  timestamp: number,
) =>
  agentSessionService.listEntries(sessionId).find((entry) => {
    if (entry.type !== entryType) return false
    try {
      const parsed = JSON.parse(entry.payload) as { role?: string; timestamp?: number }
      return parsed.role === role && parsed.timestamp === timestamp
    } catch {
      return false
    }
  })

// 原地更新同一条切换 entry 的 payload（按 role + timestamp 定位，seq 与位置不变）。
const updateSwitchEntryPayload = (
  sessionId: string,
  entryType: "model_change" | "mode_change",
  role: "modelSwitch" | "modeSwitch",
  timestamp: number,
  message: AgentMessage,
): void => {
  const target = findSwitchEntry(sessionId, entryType, role, timestamp)
  if (!target) return
  agentSessionService.updateEntryPayload(target.external_id, JSON.stringify(message))
}

// 删除同一条切换 entry（用户切回运行起点模式时整条撤销，不留库内痕迹）。
const deleteSwitchEntry = (
  sessionId: string,
  entryType: "model_change" | "mode_change",
  role: "modelSwitch" | "modeSwitch",
  timestamp: number,
): void => {
  const target = findSwitchEntry(sessionId, entryType, role, timestamp)
  if (!target) return
  agentSessionService.deleteEntries([target.external_id])
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
