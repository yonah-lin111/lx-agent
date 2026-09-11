import { randomUUID } from "node:crypto"
import { GatewayClient } from "@openclaw/gateway-client"
import type { EventFrame } from "@openclaw/gateway-protocol/frame-guards"
import { PROTOCOL_VERSION } from "@openclaw/gateway-protocol/version"
import type {
  OpenClawChatMessage,
  OpenClawConnectionStatus,
  OpenClawConnectResult,
  OpenClawSendMessageInput,
  OpenClawSessionEvent,
  OpenClawSessionSnapshot,
} from "@shared/contracts/openclaw"
import type { OpenClawAgentItem, OpenClawInstanceConfig } from "@shared/settings"
import { getOpenClawSettings } from "@/services/settingsService"
import { buildOpenClawHostDeps } from "./openclawDeviceAuth"

// 本应用在每个 Agent 下使用的专属会话 key 前缀；完整 key 为 agent:<agentId>:<base>。
const SESSION_KEY_BASE = "lx-agent"

// 组装 Gateway 规范化的会话 key（gateway 会把裸 key 归一为 agent:<agentId>:<key>）。
const buildSessionKey = (agentId: string, suffix: string): string => `agent:${agentId}:${suffix}`

// operator 连接申请的权限范围。tool-events 用于接收结构化工具事件。
const OPERATOR_SCOPES = ["operator.read", "operator.write", "operator.approvals"]
const CLIENT_CAPS = ["tool-events"]

// agent run 的最长等待时间（10 分钟），与 CLI 默认一致。
const AGENT_RUN_TIMEOUT_MS = 600_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// 从消息 content（字符串或文本块数组）中提取纯文本。
const extractText = (content: unknown): string => {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((block) =>
      isRecord(block) && block.type === "text" && typeof block.text === "string" ? block.text : "",
    )
    .join("")
}

// 单个 Agent 会话的运行时状态。
interface AgentSession {
  agentId: string
  sessionKey: string
  messages: OpenClawChatMessage[]
  isStreaming: boolean
  activeRunId: string | null
  // 是否已向 Gateway 注册该 sessionKey 的消息订阅。
  subscribed: boolean
}

// 单个实例的连接状态。
interface InstanceConnection {
  instanceId: string
  config: OpenClawInstanceConfig
  client: GatewayClient | null
  status: OpenClawConnectionStatus
  error?: string
  pairingRequestId?: string
  readonly sessions: Map<string, AgentSession>
}

/**
 * OpenClaw Gateway 连接池与会话状态管理器（主进程权威）。
 *
 * 每个实例维护一条 WebSocket 连接；每个 (instanceId, agentId) 维护一条专属
 * 会话（sessionKey 固定为 agent:<agentId>:lx-agent）。连接与消息状态全部由本
 * 管理器持有，渲染进程仅接收事件投影。
 */
class OpenClawClientManager {
  private readonly connections = new Map<string, InstanceConnection>()
  private eventSink: ((event: OpenClawSessionEvent) => void) | null = null

  // 注册渲染进程事件出口。
  setEventSink(sink: (event: OpenClawSessionEvent) => void): void {
    this.eventSink = sink
  }

  private emit(event: OpenClawSessionEvent): void {
    this.eventSink?.(event)
  }

  private emitSnapshot(connection: InstanceConnection, session: AgentSession): void {
    this.emit({
      kind: "snapshot",
      instanceId: connection.instanceId,
      agentId: session.agentId,
      snapshot: this.toSnapshot(connection, session),
    })
  }

  private toSnapshot(
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
      messages: session.messages.map((message) => ({ ...message })),
    }
  }

  // 读取指定实例配置；不存在或未启用时返回 null。
  private resolveConfig(instanceId: string): OpenClawInstanceConfig | null {
    const settings = getOpenClawSettings()
    const config = settings.instances[instanceId]
    if (!config || !config.enabled) return null
    return config
  }

  private getOrCreateConnection(instanceId: string): InstanceConnection {
    const existing = this.connections.get(instanceId)
    if (existing) return existing

    const config = this.resolveConfig(instanceId)
    if (!config) throw new Error(`OpenClaw instance not found or disabled: ${instanceId}`)

    const connection: InstanceConnection = {
      instanceId,
      config,
      client: null,
      status: "disconnected",
      sessions: new Map(),
    }
    this.connections.set(instanceId, connection)
    return connection
  }

  // 读取（必要时创建）某个 Agent 的专属会话。
  private getOrCreateSession(connection: InstanceConnection, agentId: string): AgentSession {
    const existing = connection.sessions.get(agentId)
    if (existing) return existing

    const session: AgentSession = {
      agentId,
      sessionKey: buildSessionKey(agentId, SESSION_KEY_BASE),
      messages: [],
      isStreaming: false,
      activeRunId: null,
      subscribed: false,
    }
    connection.sessions.set(agentId, session)
    return session
  }

  // 通过 sessionKey 定位会话。
  private findSessionByKey(
    connection: InstanceConnection,
    sessionKey: string,
  ): AgentSession | null {
    for (const session of connection.sessions.values()) {
      if (session.sessionKey === sessionKey) return session
    }
    return null
  }

  /**
   * 建立（或复用）到指定实例的连接。
   */
  async connect(instanceId: string): Promise<OpenClawConnectResult> {
    let connection: InstanceConnection
    try {
      connection = this.getOrCreateConnection(instanceId)
    } catch (error) {
      return { status: "error", error: error instanceof Error ? error.message : String(error) }
    }

    // 配置可能在设置页被改动，重连前刷新。
    const config = this.resolveConfig(instanceId)
    if (config) connection.config = config

    if (connection.client && connection.status === "connected") {
      return { status: "connected" }
    }

    if (connection.client) {
      connection.client.stop()
      connection.client = null
    }

    connection.status = "connecting"
    delete connection.error
    delete connection.pairingRequestId
    for (const session of connection.sessions.values()) {
      this.emitSnapshot(connection, session)
    }

    const settled = Promise.withResolvers<OpenClawConnectResult>()

    // 本机 loopback 走 gateway-client/backend 默认身份（仅需 shared token）；
    // 远端必须声明为 WebChat 客户端并提供设备身份，交由 Gateway 走设备配对。
    const isDeviceAuth = connection.config.authMode === "device"

    const client = new GatewayClient({
      url: connection.config.gatewayUrl,
      ...(connection.config.token ? { token: connection.config.token } : {}),
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      ...(isDeviceAuth ? { clientName: "openclaw-macos", mode: "ui" } : {}),
      role: "operator",
      scopes: OPERATOR_SCOPES,
      caps: CLIENT_CAPS,
      clientVersion: "0.1.0",
      hostDeps: buildOpenClawHostDeps(instanceId),
      onHelloOk: () => {
        if (connectTimer) clearTimeout(connectTimer)
        console.log(`[OpenClaw] Connected to instance ${instanceId}`)
        connection.status = "connected"
        delete connection.error
        delete connection.pairingRequestId
        for (const session of connection.sessions.values()) {
          this.emitSnapshot(connection, session)
        }
        settled.resolve({ status: "connected" })
      },
      onConnectError: (error) => {
        if (connectTimer) clearTimeout(connectTimer)
        const info = parseConnectError(error)
        console.error(`[OpenClaw] Connect error for instance ${instanceId}:`, error)
        connection.status = info.status
        connection.error = info.message
        if (info.pairingRequestId) connection.pairingRequestId = info.pairingRequestId
        for (const session of connection.sessions.values()) {
          this.emitSnapshot(connection, session)
        }
        settled.resolve({
          status: info.status,
          error: info.message,
          ...(info.pairingRequestId ? { pairingRequestId: info.pairingRequestId } : {}),
        })
      },
      onEvent: (event) => this.handleEvent(connection, event),
      onClose: (code, reason) => {
        if (connection.status === "connected" || connection.status === "connecting") {
          connection.status = "disconnected"
          connection.error = `Connection closed (${code})${reason ? `: ${reason}` : ""}`
          for (const session of connection.sessions.values()) {
            this.emitSnapshot(connection, session)
          }
        }
      },
    })

    // 连接握手安全超时（8秒），避免网络不可达/丢包导致一直挂起
    let connectTimer: NodeJS.Timeout | null = setTimeout(() => {
      connectTimer = null
      if (connection.status === "connecting") {
        const errorMsg = `Connection to OpenClaw gateway timed out (${connection.config.gatewayUrl})`
        connection.status = "error"
        connection.error = errorMsg
        for (const session of connection.sessions.values()) {
          this.emitSnapshot(connection, session)
        }
        settled.resolve({ status: "error", error: errorMsg })
        connection.client?.stop()
      }
    }, 8000)

    connection.client = client
    try {
      client.start()
    } catch (error) {
      if (connectTimer) clearTimeout(connectTimer)
      const info = parseConnectError(error instanceof Error ? error : new Error(String(error)))
      connection.status = info.status
      connection.error = info.message
      settled.resolve({ status: info.status, error: info.message })
    }

    return settled.promise
  }

  /**
   * 断开指定实例连接并清理会话状态。
   */
  async disconnect(instanceId: string): Promise<void> {
    const connection = this.connections.get(instanceId)
    if (!connection) return

    connection.client?.stop()
    connection.client = null
    connection.status = "disconnected"
    delete connection.error
    delete connection.pairingRequestId
    connection.sessions.clear()
    this.connections.delete(instanceId)
  }

  /**
   * 探测实例下注册的 Agent 列表。
   */
  async fetchAgents(
    instanceId: string,
  ): Promise<OpenClawConnectResult & { agents: OpenClawAgentItem[] }> {
    const connected = await this.connect(instanceId)
    if (connected.status !== "connected") return { ...connected, agents: [] }

    const connection = this.connections.get(instanceId)
    if (!connection?.client) return { status: "error", error: "Not connected", agents: [] }

    try {
      const payload = await connection.client.request<{
        agents?: Array<Record<string, unknown>>
        defaultId?: unknown
      }>("agents.list", {})
      const rawAgents = Array.isArray(payload?.agents) ? payload.agents : []
      const defaultId = typeof payload?.defaultId === "string" ? payload.defaultId : undefined
      const agents = rawAgents
        .map((raw) => mapAgent(raw, defaultId))
        .filter((agent): agent is OpenClawAgentItem => agent !== null)
      return { status: "connected", agents }
    } catch (error) {
      return {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        agents: [],
      }
    }
  }

  /**
   * 读取指定会话快照。
   */
  async getSnapshot(instanceId: string, agentId: string): Promise<OpenClawSessionSnapshot> {
    const connection = this.getOrCreateConnection(instanceId)
    const session = this.getOrCreateSession(connection, agentId)
    return this.toSnapshot(connection, session)
  }

  /**
   * 向指定 Agent 的专属会话发送任务，并在该会话内流式接收回复。
   */
  async sendMessage(input: OpenClawSendMessageInput): Promise<void> {
    const { instanceId, agentId, message } = input
    const connected = await this.connect(instanceId)
    if (connected.status !== "connected") {
      throw new Error(connected.error || "OpenClaw connection is not ready")
    }

    const connection = this.connections.get(instanceId)
    const client = connection?.client
    if (!connection || !client) throw new Error("OpenClaw connection is not ready")

    const session = this.getOrCreateSession(connection, agentId)
    if (session.isStreaming) {
      throw new Error("This agent is already running a task")
    }

    session.messages.push({
      id: randomUUID(),
      role: "user",
      content: message,
      timestamp: Date.now(),
      status: "completed",
    })
    session.isStreaming = true
    session.activeRunId = null
    this.emitSnapshot(connection, session)

    await this.ensureSubscribed(session, client)

    void client
      .request(
        "agent",
        {
          agentId,
          sessionKey: session.sessionKey,
          message,
          idempotencyKey: randomUUID(),
        },
        { timeoutMs: AGENT_RUN_TIMEOUT_MS },
      )
      .then(() => {
        session.isStreaming = false
        session.activeRunId = null
        for (const msg of session.messages) {
          if (msg.role === "assistant" && msg.status === "streaming") msg.status = "completed"
        }
        this.emitSnapshot(connection, session)
      })
      .catch((error: unknown) => {
        session.isStreaming = false
        session.activeRunId = null
        const text = error instanceof Error ? error.message : String(error)
        const streaming = session.messages.find(
          (msg) => msg.role === "assistant" && msg.status === "streaming",
        )
        if (streaming) {
          streaming.status = "error"
          streaming.error = text
        } else {
          session.messages.push({
            id: randomUUID(),
            role: "system",
            content: text,
            timestamp: Date.now(),
            status: "error",
            error: text,
          })
        }
        this.emitSnapshot(connection, session)
      })
  }

  /**
   * 中止该会话进行中的 run。
   */
  async abort(instanceId: string, agentId: string): Promise<void> {
    const connection = this.connections.get(instanceId)
    const client = connection?.client
    if (!connection || !client) return
    const session = this.getOrCreateSession(connection, agentId)
    try {
      await client.request("sessions.abort", { key: session.sessionKey })
    } catch {
      // 无进行中的 run 时静默忽略。
    }
    session.isStreaming = false
    session.activeRunId = null
    this.emitSnapshot(connection, session)
  }

  /**
   * 清空会话消息记录（保留 sessionKey 与 OpenClaw 侧上下文）。
   */
  async clearMessages(instanceId: string, agentId: string): Promise<void> {
    const connection = this.connections.get(instanceId)
    if (!connection) return
    const session = this.getOrCreateSession(connection, agentId)
    session.messages = []
    this.emitSnapshot(connection, session)
  }

  /**
   * 清空会话视图并切换到新的 sessionKey。
   */
  async resetSession(instanceId: string, agentId: string): Promise<void> {
    const connection = this.connections.get(instanceId)
    if (!connection) return
    const session = this.getOrCreateSession(connection, agentId)
    session.sessionKey = buildSessionKey(agentId, `${SESSION_KEY_BASE}-${Date.now().toString(36)}`)
    session.messages = []
    session.isStreaming = false
    session.activeRunId = null
    session.subscribed = false
    this.emitSnapshot(connection, session)
  }

  // 释放所有连接。
  disposeAll(): void {
    for (const connection of this.connections.values()) {
      connection.client?.stop()
      connection.client = null
    }
    this.connections.clear()
  }

  // 确保会话消息订阅已建立。
  private async ensureSubscribed(session: AgentSession, client: GatewayClient): Promise<void> {
    if (session.subscribed) return
    try {
      await client.request("sessions.messages.subscribe", { key: session.sessionKey })
      session.subscribed = true
    } catch {
      // 订阅失败不阻塞发送：事件仍可能由 Gateway 推送。
    }
  }

  // 处理 Gateway 事件，归并到对应会话。
  private handleEvent(connection: InstanceConnection, event: EventFrame): void {
    if (event.event === "exec.approval.requested") {
      this.handleApprovalRequested(connection, event)
      return
    }
    if (event.event !== "agent" && event.event !== "chat") return
    const payload = event.payload
    if (!isRecord(payload)) return

    const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : null
    if (!sessionKey) return
    const session = this.findSessionByKey(connection, sessionKey)
    if (!session) return

    const runId = typeof payload.runId === "string" ? payload.runId : null
    if (runId) session.activeRunId = runId

    if (event.event === "agent") {
      this.handleAgentEvent(connection, session, payload, runId)
      return
    }

    this.handleChatEvent(connection, session, payload, runId)
  }

  // 处理 agent 生命周期与助手文本流。
  private handleAgentEvent(
    connection: InstanceConnection,
    session: AgentSession,
    payload: Record<string, unknown>,
    runId: string | null,
  ): void {
    const stream = payload.stream
    const data = isRecord(payload.data) ? payload.data : null

    if (stream === "lifecycle" && data) {
      if (data.phase === "start" && runId) {
        if (!this.findMessage(session, runId)) {
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
        this.emitSnapshot(connection, session)
        return
      }

      if (data.phase === "end" && runId) {
        const message = this.findMessage(session, runId)
        if (message && message.status === "streaming") {
          message.status = data.aborted === true ? "error" : "completed"
          if (data.aborted === true) message.error = "Aborted"
        }
        session.isStreaming = false
        session.activeRunId = null
        this.emitSnapshot(connection, session)
        return
      }
      return
    }

    if (stream === "assistant" && data && runId) {
      const delta = typeof data.delta === "string" ? data.delta : ""
      if (!delta) return
      let message = this.findMessage(session, runId)
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
      this.emitSessionMessage(connection, session, message)
    }
  }

  // 处理 chat 事件的权威最终文本。
  private handleChatEvent(
    connection: InstanceConnection,
    session: AgentSession,
    payload: Record<string, unknown>,
    runId: string | null,
  ): void {
    if (!runId) return
    const state = payload.state
    const rawMessage = isRecord(payload.message) ? payload.message : null
    const text = rawMessage ? extractText(rawMessage.content) : ""

    let message = this.findMessage(session, runId)
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
      if (text) message.content = text
      message.status = "completed"
      session.isStreaming = false
      session.activeRunId = null
      this.emitSnapshot(connection, session)
      return
    }

    if (text) {
      message.content = text
      this.emitSessionMessage(connection, session, message)
    }
  }

  // 审批请求兜底：把待审批事项作为系统消息落到对应会话，让状态可见且可中止。
  private handleApprovalRequested(connection: InstanceConnection, event: EventFrame): void {
    const payload = event.payload
    if (!isRecord(payload)) return

    const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : null
    if (!sessionKey) return
    const session = this.findSessionByKey(connection, sessionKey)
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
    this.emitSnapshot(connection, session)
  }

  private findMessage(session: AgentSession, messageId: string): OpenClawChatMessage | undefined {
    return session.messages.find((message) => message.id === messageId)
  }

  private emitSessionMessage(
    connection: InstanceConnection,
    session: AgentSession,
    message: OpenClawChatMessage,
  ): void {
    this.emit({
      kind: "message-update",
      instanceId: connection.instanceId,
      agentId: session.agentId,
      message: { ...message },
    })
  }
}

// 解析连接错误，识别设备配对待审批与网络不可达等场景。
const parseConnectError = (
  error: Error,
): { status: OpenClawConnectionStatus; message: string; pairingRequestId?: string } => {
  const rawMessage = error.message || String(error)
  if (/PAIRING_REQUIRED|pairing/i.test(rawMessage)) {
    const match = rawMessage.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    return {
      status: "pairing-required",
      message: rawMessage,
      ...(match ? { pairingRequestId: match[0] } : {}),
    }
  }

  // 捕获典型的网络层不可达/拒绝连接异常
  if (/EHOSTUNREACH/i.test(rawMessage)) {
    return {
      status: "error",
      message: `EHOSTUNREACH: ${rawMessage}`,
    }
  }
  if (/ECONNREFUSED/i.test(rawMessage)) {
    return {
      status: "error",
      message: `ECONNREFUSED: ${rawMessage}`,
    }
  }
  if (/ETIMEDOUT/i.test(rawMessage)) {
    return {
      status: "error",
      message: `ETIMEDOUT: ${rawMessage}`,
    }
  }
  if (/ENOTFOUND/i.test(rawMessage)) {
    return {
      status: "error",
      message: `ENOTFOUND: ${rawMessage}`,
    }
  }

  return { status: "error", message: rawMessage }
}

// 将 Gateway 返回的 agent 条目映射为配置模型。
const mapAgent = (raw: Record<string, unknown>, defaultId?: string): OpenClawAgentItem | null => {
  const id = typeof raw.id === "string" ? raw.id.trim() : ""
  if (!id) return null
  const identity = isRecord(raw.identity) ? raw.identity : null
  const identityName = identity && typeof identity.name === "string" ? identity.name.trim() : ""
  const rawName = typeof raw.name === "string" ? raw.name.trim() : ""
  const workspace = typeof raw.workspace === "string" ? raw.workspace.trim() : ""
  return {
    id,
    name: identityName || rawName || id,
    ...(workspace ? { workspace } : {}),
    ...(defaultId === id ? { isDefault: true } : {}),
  }
}

export const openClawClientManager = new OpenClawClientManager()
