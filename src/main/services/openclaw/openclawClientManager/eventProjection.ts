import { randomUUID } from "node:crypto"
import type { EventFrame } from "@openclaw/gateway-protocol/frame-guards"
import type {
  OpenClawChatMessage,
  OpenClawSessionEvent,
  OpenClawSessionSnapshot,
} from "@shared/contracts/openclaw"
import { extractText, isRecord, mapMessageUsage, readTrimmedString } from "./payloadMappers"
import type { AgentSession, InstanceConnection, OpenClawClientManagerHost } from "./types"

export function emit(host: OpenClawClientManagerHost, event: OpenClawSessionEvent): void {
  host.eventSink?.(event)
}

export function emitSnapshot(
  host: OpenClawClientManagerHost,
  connection: InstanceConnection,
  session: AgentSession,
): void {
  emit(host, {
    kind: "snapshot",
    instanceId: connection.instanceId,
    agentId: session.agentId,
    snapshot: toSnapshot(connection, session),
  })
}

export function toSnapshot(
  connection: InstanceConnection,
  session: AgentSession,
): OpenClawSessionSnapshot {
  return {
    instanceId: connection.instanceId,
    agentId: session.agentId,
    sessionKey: session.sessionKey,
    connectionStatus: connection.status,
    ...(connection.error ? { connectionError: connection.error } : {}),
    ...(connection.pairingRequestId ? { pairingRequestId: connection.pairingRequestId } : {}),
    isStreaming: session.isStreaming,
    ...(session.stats ? { stats: { ...session.stats } } : {}),
    messages: session.messages.map((message) => ({ ...message })),
  }
}

// 处理 Gateway 事件，归并到对应会话。
export function handleEvent(
  host: OpenClawClientManagerHost,
  connection: InstanceConnection,
  event: EventFrame,
): void {
  if (event.event === "exec.approval.requested") {
    handleApprovalRequested(host, connection, event)
    return
  }
  if (event.event !== "agent" && event.event !== "chat") return
  const payload = event.payload
  if (!isRecord(payload)) return

  const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : null
  if (!sessionKey) return
  const session = host.findSessionByKey(connection, sessionKey)
  if (!session) return

  const runId = typeof payload.runId === "string" ? payload.runId : null
  if (runId) session.activeRunId = runId

  if (event.event === "agent") {
    handleAgentEvent(host, connection, session, payload, runId)
    return
  }

  handleChatEvent(host, connection, session, payload, runId)
}

// 处理 agent 生命周期与助手文本流。
export function handleAgentEvent(
  host: OpenClawClientManagerHost,
  connection: InstanceConnection,
  session: AgentSession,
  payload: Record<string, unknown>,
  runId: string | null,
): void {
  const stream = payload.stream
  const data = isRecord(payload.data) ? payload.data : null

  if (stream === "lifecycle" && data) {
    if (data.phase === "start" && runId) {
      if (!findMessage(session, runId)) {
        session.messages.push({
          id: runId,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          runId,
          status: "streaming",
        })
      }
      session.isStreaming = true
      emitSnapshot(host, connection, session)
      return
    }

    if (data.phase === "end" && runId) {
      const wasStreaming = session.isStreaming
      const message = findMessage(session, runId)
      if (message && message.status === "streaming") {
        message.status = data.aborted === true ? "error" : "completed"
        if (data.aborted === true) message.error = "Aborted"
      }
      session.isStreaming = false
      session.activeRunId = null
      emitSnapshot(host, connection, session)
      // 流式 true → false 才视为一次 run 结束，避免与 chat final 重复回调。
      if (wasStreaming) {
        host.runFinishedListener?.(connection, session, data.aborted === true)
      }
      void host.refreshStats(connection, session)
      return
    }
    return
  }

  if (stream === "assistant" && data && runId) {
    const delta = typeof data.delta === "string" ? data.delta : ""
    if (!delta) return
    let message = findMessage(session, runId)
    if (!message) {
      message = {
        id: runId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        runId,
        status: "streaming",
      }
      session.messages.push(message)
    }
    message.content += delta
    emitSessionMessage(host, connection, session, message)
  }
}

// 处理 chat 事件的权威最终文本。
export function handleChatEvent(
  host: OpenClawClientManagerHost,
  connection: InstanceConnection,
  session: AgentSession,
  payload: Record<string, unknown>,
  runId: string | null,
): void {
  if (!runId) return
  const state = payload.state
  const rawMessage = isRecord(payload.message) ? payload.message : null
  const text = rawMessage ? extractText(rawMessage.content) : ""

  let message = findMessage(session, runId)
  if (!message) {
    message = {
      id: runId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      runId,
      status: "streaming",
    }
    session.messages.push(message)
  }

  if (state === "final") {
    const wasStreaming = session.isStreaming
    // lifecycle end 已按 aborted 把消息标记为 error，此处保留该判定。
    const wasAborted = message.status === "error"
    if (text) message.content = text
    // run 结束回填该条消息生成时的模型与 token 用量（权威值）。
    const model = rawMessage ? readTrimmedString(rawMessage.model) : undefined
    const modelProvider = rawMessage
      ? (readTrimmedString(rawMessage.provider) ?? readTrimmedString(rawMessage.modelProvider))
      : undefined
    const usage = isRecord(payload.usage)
      ? mapMessageUsage(payload.usage)
      : rawMessage && isRecord(rawMessage.usage)
        ? mapMessageUsage(rawMessage.usage)
        : null
    if (model) message.model = model
    if (modelProvider) message.modelProvider = modelProvider
    if (usage) message.usage = usage
    message.status = "completed"
    session.isStreaming = false
    session.activeRunId = null
    emitSnapshot(host, connection, session)
    // 流式 true → false 才视为一次 run 结束，避免与 lifecycle end 重复回调。
    if (wasStreaming) {
      host.runFinishedListener?.(connection, session, wasAborted)
    }
    return
  }

  if (state === "error" || state === "aborted") {
    // chat.send 请求在受理时即返回，run 失败/中止只能由事件收敛；
    // lifecycle end 只在消息仍为 streaming 时改写状态，故此处先标记 error 不会被覆盖。
    const wasStreaming = session.isStreaming
    const aborted = state === "aborted"
    message.status = "error"
    message.error =
      (aborted ? undefined : readTrimmedString(payload.errorMessage)) ||
      (aborted ? "Aborted" : "Run failed")
    session.isStreaming = false
    session.activeRunId = null
    emitSnapshot(host, connection, session)
    if (wasStreaming) {
      host.runFinishedListener?.(connection, session, aborted)
    }
    void host.refreshStats(connection, session)
    return
  }

  if (text) {
    message.content = text
    emitSessionMessage(host, connection, session, message)
  }
}

// 审批请求兜底：把待审批事项作为系统消息落到对应会话，让状态可见且可中止。
export function handleApprovalRequested(
  host: OpenClawClientManagerHost,
  connection: InstanceConnection,
  event: EventFrame,
): void {
  const payload = event.payload
  if (!isRecord(payload)) return

  const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : null
  if (!sessionKey) return
  const session = host.findSessionByKey(connection, sessionKey)
  if (!session) return

  const requestId =
    typeof payload.requestId === "string"
      ? payload.requestId
      : typeof payload.id === "string"
        ? payload.id
        : ""

  session.messages.push({
    id: `approval-${requestId || randomUUID()}`,
    role: "system",
    content: requestId,
    timestamp: Date.now(),
    status: "completed",
    code: "approval-required",
  })
  emitSnapshot(host, connection, session)
}

export function findMessage(
  session: AgentSession,
  messageId: string,
): OpenClawChatMessage | undefined {
  return session.messages.find((message) => message.id === messageId)
}

export function emitSessionMessage(
  host: OpenClawClientManagerHost,
  connection: InstanceConnection,
  session: AgentSession,
  message: OpenClawChatMessage,
): void {
  emit(host, {
    kind: "message-update",
    instanceId: connection.instanceId,
    agentId: session.agentId,
    message: { ...message },
  })
}
