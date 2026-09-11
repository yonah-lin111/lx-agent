import { randomUUID } from "node:crypto"
import net from "node:net"
import { GatewayClient } from "@openclaw/gateway-client"
import type { EventFrame } from "@openclaw/gateway-protocol/frame-guards"
import { PROTOCOL_VERSION } from "@openclaw/gateway-protocol/version"
import type {
  OpenClawChatMessage,
  OpenClawConnectionStatus,
  OpenClawConnectResult,
  OpenClawSendMessageInput,
  OpenClawSessionEvent,
  OpenClawSessionInfo,
  OpenClawSessionSnapshot,
} from "@shared/contracts/openclaw"
import type { OpenClawAgentItem, OpenClawInstanceConfig } from "@shared/settings"
import { getOpenClawSettings, saveOpenClawSettings } from "@/services/settingsService"
import { buildOpenClawHostDeps } from "./openclawDeviceAuth"

// operator 连接申请的权限范围。tool-events 用于接收结构化工具事件。
const OPERATOR_SCOPES = ["operator.read", "operator.write", "operator.approvals"]
const CLIENT_CAPS = ["tool-events"]

// agent run 的最长等待时间（10 分钟），与 CLI 默认一致。
const AGENT_RUN_TIMEOUT_MS = 600_000

// 单次历史水合与会话列表的最大条数。
const HISTORY_LIMIT = 200
const SESSION_LIST_LIMIT = 100

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
  // 绑定的 Gateway 会话 key；null 表示该 Agent 尚未绑定会话。
  sessionKey: string | null
  messages: OpenClawChatMessage[]
  isStreaming: boolean
  activeRunId: string | null
  // 是否已向 Gateway 注册该 sessionKey 的消息订阅。
  subscribed: boolean
  // 是否已从 Gateway 水合历史消息（连接建立/切换绑定时重置）。
  hydrated: boolean
}

// 单个实例的连接状态。
interface InstanceConnection {
  instanceId: string
  config: OpenClawInstanceConfig
  client: GatewayClient | null
  status: OpenClawConnectionStatus
  error?: string
  pairingRequestId?: string
  retryTimer?: NodeJS.Timeout | null
  retryCount?: number
  connectingPromise?: Promise<OpenClawConnectResult> | null
  readonly sessions: Map<string, AgentSession>
}

/**
 * OpenClaw Gateway 连接池与会话状态管理器（主进程权威）。
 *
 * 每个实例维护一条 WebSocket 连接；每个 (instanceId, agentId) 维护一条
 * 绑定到 Gateway 会话 key 的投影（key 由设置显式绑定，未绑定时不可发送）。
 * 连接与消息状态全部由本管理器持有，渲染进程仅接收事件投影。
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

  // 从实例配置解析该 Agent 绑定的会话 key。
  private resolveBoundSessionKey(connection: InstanceConnection, agentId: string): string | null {
    const agent = connection.config.agents.find((item) => item.id === agentId)
    const key = agent?.sessionKey?.trim()
    return key ? key : null
  }

  // 设置页可能改动实例配置，操作前刷新内存配置。
  private refreshConnectionConfig(connection: InstanceConnection): void {
    const config = this.resolveConfig(connection.instanceId)
    if (config) connection.config = config
  }

  // 配置中的绑定变化时重置该 Agent 的会话投影。
  private syncSessionBinding(connection: InstanceConnection, session: AgentSession): void {
    const bound = this.resolveBoundSessionKey(connection, session.agentId)
    if (session.sessionKey === bound) return
    session.sessionKey = bound
    session.messages = []
    session.isStreaming = false
    session.activeRunId = null
    session.subscribed = false
    session.hydrated = false
  }

  // 读取（必要时创建）某个 Agent 的会话投影。
  private getOrCreateSession(connection: InstanceConnection, agentId: string): AgentSession {
    const existing = connection.sessions.get(agentId)
    if (existing) return existing

    const session: AgentSession = {
      agentId,
      sessionKey: this.resolveBoundSessionKey(connection, agentId),
      messages: [],
      isStreaming: false,
      activeRunId: null,
      subscribed: false,
      hydrated: false,
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

    if (connection.status === "connecting" && connection.connectingPromise) {
      return connection.connectingPromise
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
    connection.connectingPromise = settled.promise.finally(() => {
      connection.connectingPromise = null
    })

    // 本机 loopback 走 gateway-client/backend 默认身份（仅需 shared token）；
    // 远端必须声明为 WebChat 客户端并提供设备身份，交由 Gateway 走设备配对。
    const isDeviceAuth = connection.config.authMode === "device"

    // 探测底层 TCP 连通性，若遇瞬态 EHOSTUNREACH 则先等待网卡与路由表就绪（重试3次）
    try {
      const url = new URL(connection.config.gatewayUrl)
      const port = Number(url.port) || (url.protocol === "wss:" ? 443 : 80)
      const host = url.hostname

      // 对非本机 loopback 地址做一次 TCP 预检重试守卫
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
        await new Promise<void>((resolve) => {
          let attempts = 0
          const probe = (): void => {
            attempts += 1
            const socket = net.connect({ host, port })
            socket.once("connect", () => {
              socket.end()
              resolve()
            })
            socket.once("error", (err) => {
              socket.destroy()
              if (attempts < 3 && /EHOSTUNREACH|ECONNREFUSED|timed? ?out/i.test(err.message)) {
                setTimeout(probe, 300)
              } else {
                // 不阻断流程，交由 GatewayClient 处理
                resolve()
              }
            })
          }
          probe()
        })
      }
    } catch {
      // url 解析失败交由 GatewayClient 处理
    }

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
        if (connection.client !== client) return
        if (connectTimer) clearTimeout(connectTimer)
        if (connection.retryTimer) {
          clearTimeout(connection.retryTimer)
          connection.retryTimer = null
        }
        connection.retryCount = 0
        console.log(`[OpenClaw] Connected to instance ${instanceId}`)
        connection.status = "connected"
        delete connection.error
        delete connection.pairingRequestId
        for (const session of connection.sessions.values()) {
          // 重连后重新水合历史并重建订阅。
          session.hydrated = false
          session.subscribed = false
          this.emitSnapshot(connection, session)
        }
        settled.resolve({ status: "connected" })
      },
      onConnectError: (error) => {
        if (connection.client !== client) return
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

        // 网络层不可达/拒绝/超时等瞬态故障交由统一重连调度（指数退避）。
        if (/EHOSTUNREACH|ECONNREFUSED|ENOTFOUND|timed? ?out/i.test(info.message)) {
          this.scheduleReconnect(connection)
        }
      },
      onEvent: (event) => this.handleEvent(connection, event),
      onClose: (code, reason) => {
        // 已被替换或显式断开（connection.client 不再指向本客户端）时忽略。
        if (connection.client !== client) return
        if (connection.status === "connected" || connection.status === "connecting") {
          connection.status = "disconnected"
          connection.error = `Connection closed (${code})${reason ? `: ${reason}` : ""}`
          for (const session of connection.sessions.values()) {
            this.emitSnapshot(connection, session)
          }
          this.scheduleReconnect(connection)
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
        this.scheduleReconnect(connection)
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
   * 非预期中断（网络抖动、对端重启、握手超时）后按指数退避自动重连（1s 起步，上限 30s）。
   * 连接成功、实例被显式断开或移除时终止。
   */
  private scheduleReconnect(connection: InstanceConnection): void {
    if (connection.retryTimer) return
    if (!this.connections.has(connection.instanceId)) return

    connection.retryCount = (connection.retryCount ?? 0) + 1
    const delay = Math.min(1000 * 2 ** (connection.retryCount - 1), 30_000)
    console.log(
      `[OpenClaw] Reconnecting instance ${connection.instanceId} in ${Math.round(delay / 1000)}s ` +
        `(attempt ${connection.retryCount})...`,
    )
    connection.retryTimer = setTimeout(() => {
      connection.retryTimer = null
      if (!this.connections.has(connection.instanceId)) return
      if (connection.status === "error" || connection.status === "disconnected") {
        void this.connect(connection.instanceId)
      }
    }, delay)
  }

  /**
   * 断开指定实例连接并清理会话状态。
   */
  async disconnect(instanceId: string): Promise<void> {
    const connection = this.connections.get(instanceId)
    if (!connection) return

    if (connection.retryTimer) {
      clearTimeout(connection.retryTimer)
      connection.retryTimer = null
    }

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
   * 读取指定会话快照；绑定时会从 Gateway 水合历史消息。
   */
  async getSnapshot(instanceId: string, agentId: string): Promise<OpenClawSessionSnapshot> {
    const connection = this.getOrCreateConnection(instanceId)
    this.refreshConnectionConfig(connection)
    const session = this.getOrCreateSession(connection, agentId)
    this.syncSessionBinding(connection, session)
    await this.hydrateSession(connection, session)
    return this.toSnapshot(connection, session)
  }

  /**
   * 列出该 Agent 在 Gateway 上已有的会话（绑定发现）。
   */
  async listSessions(instanceId: string, agentId: string): Promise<OpenClawSessionInfo[]> {
    const connected = await this.connect(instanceId)
    if (connected.status !== "connected") {
      throw new Error(connected.error || "OpenClaw connection is not ready")
    }
    const connection = this.connections.get(instanceId)
    const client = connection?.client
    if (!connection || !client) throw new Error("OpenClaw connection is not ready")

    const payload = await client.request<unknown>("sessions.list", {
      agentId,
      limit: SESSION_LIST_LIMIT,
      includeDerivedTitles: true,
    })
    return mapSessionList(payload)
  }

  /**
   * 在 Gateway 上为该 Agent 新建会话并立即绑定。
   */
  async createSession(instanceId: string, agentId: string): Promise<OpenClawSessionInfo> {
    const connected = await this.connect(instanceId)
    if (connected.status !== "connected") {
      throw new Error(connected.error || "OpenClaw connection is not ready")
    }
    const connection = this.connections.get(instanceId)
    const client = connection?.client
    if (!connection || !client) throw new Error("OpenClaw connection is not ready")

    const { key, displayName } = await this.mintSession(connection, client, agentId)
    await this.bindSession(instanceId, agentId, key)
    return { key, ...(displayName ? { displayName } : {}) }
  }

  /**
   * 向 Gateway 申请新会话 key；dynamic scope 不可用时回退为本地生成
   * （发送首条消息时由 Gateway 自动建会话）。
   */
  private async mintSession(
    connection: InstanceConnection,
    client: GatewayClient,
    agentId: string,
  ): Promise<{ key: string; displayName?: string }> {
    try {
      const payload = await client.request<Record<string, unknown>>("sessions.create", {
        agentId,
        idempotencyKey: randomUUID(),
      })
      const key = typeof payload?.key === "string" ? payload.key.trim() : ""
      if (key) {
        const displayName =
          typeof payload?.displayName === "string" ? payload.displayName.trim() : ""
        return { key, ...(displayName ? { displayName } : {}) }
      }
    } catch (error) {
      console.warn(
        `[OpenClaw] sessions.create rejected for ${connection.instanceId}/${agentId}, falling back to a local key:`,
        error,
      )
    }
    return { key: `agent:${agentId}:lx-agent-${Date.now().toString(36)}` }
  }

  /**
   * 将该 Agent 绑定到指定 Gateway 会话并持久化到配置。
   */
  async bindSession(instanceId: string, agentId: string, sessionKey: string): Promise<void> {
    const key = sessionKey.trim()
    if (!key) throw new Error("Session key is required")

    const connection = this.getOrCreateConnection(instanceId)
    this.refreshConnectionConfig(connection)
    const settings = getOpenClawSettings()
    const instance = settings.instances[instanceId]
    if (!instance) throw new Error(`OpenClaw instance not found: ${instanceId}`)
    if (!instance.agents.some((agent) => agent.id === agentId)) {
      throw new Error(`OpenClaw agent not found: ${agentId}`)
    }

    const agents = instance.agents.map((agent) =>
      agent.id === agentId ? { ...agent, sessionKey: key } : agent,
    )
    const saved = saveOpenClawSettings({
      ...settings,
      instances: { ...settings.instances, [instanceId]: { ...instance, agents } },
    })
    connection.config = saved.instances[instanceId] ?? connection.config

    const session = this.getOrCreateSession(connection, agentId)
    const previousKey = session.sessionKey
    // 释放旧会话的消息订阅（best-effort）。
    if (previousKey && previousKey !== key && session.subscribed && connection.client) {
      void connection.client
        .request("sessions.messages.unsubscribe", { key: previousKey })
        .catch(() => {})
    }

    session.sessionKey = key
    session.messages = []
    session.isStreaming = false
    session.activeRunId = null
    session.subscribed = false
    session.hydrated = false
    this.emitSnapshot(connection, session)

    await this.hydrateSession(connection, session)
  }

  /**
   * 向该 Agent 绑定的会话发送任务，并在该会话内流式接收回复。
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
    this.syncSessionBinding(connection, session)
    if (session.isStreaming) {
      throw new Error("This agent is already running a task")
    }
    let sessionKey = session.sessionKey
    if (!sessionKey) {
      // 未绑定会话时自动新建并持久化绑定，避免发送死角。
      const created = await this.createSession(instanceId, agentId)
      sessionKey = created.key
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
          sessionKey,
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
    this.syncSessionBinding(connection, session)
    if (!session.sessionKey) return
    try {
      await client.request("sessions.abort", { key: session.sessionKey })
    } catch {
      // 无进行中的 run 时静默忽略。
    }
    session.isStreaming = false
    session.activeRunId = null
    this.emitSnapshot(connection, session)
  }

  // 释放所有连接。
  disposeAll(): void {
    for (const connection of this.connections.values()) {
      if (connection.retryTimer) {
        clearTimeout(connection.retryTimer)
        connection.retryTimer = null
      }
      connection.client?.stop()
      connection.client = null
    }
    this.connections.clear()
  }

  // 从 Gateway 水合绑定会话的历史消息，并建立外部消息订阅。
  private async hydrateSession(
    connection: InstanceConnection,
    session: AgentSession,
  ): Promise<void> {
    if (session.hydrated) return
    const client = connection.client
    const sessionKey = session.sessionKey
    if (!sessionKey || !client || connection.status !== "connected") return

    session.hydrated = true
    try {
      const payload = await client.request<unknown>("chat.history", {
        sessionKey,
        limit: HISTORY_LIMIT,
      })
      if (session.sessionKey !== sessionKey) return
      session.messages = mapHistoryMessages(payload)
      this.emitSnapshot(connection, session)
      await this.ensureSubscribed(session, client)
    } catch (error) {
      console.warn(`[OpenClaw] Failed to hydrate session ${sessionKey}:`, error)
    }
  }

  // 确保会话消息订阅已建立。
  private async ensureSubscribed(session: AgentSession, client: GatewayClient): Promise<void> {
    if (session.subscribed || !session.sessionKey) return
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

// 从 sessions.list 结果中提取会话行（结果封套为开放 schema，做多形态兼容）。
const extractSessionRows = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) return payload.filter(isRecord)
  if (!isRecord(payload)) return []
  for (const field of ["sessions", "rows", "items", "entries"]) {
    const value = payload[field]
    if (Array.isArray(value)) return value.filter(isRecord)
  }
  return []
}

// 将 sessions.list 行映射为会话摘要。
const mapSessionInfo = (raw: Record<string, unknown>): OpenClawSessionInfo | null => {
  const key = typeof raw.key === "string" ? raw.key.trim() : ""
  if (!key) return null
  const label = typeof raw.label === "string" ? raw.label.trim() : ""
  const displayName =
    typeof raw.displayName === "string"
      ? raw.displayName.trim()
      : typeof raw.derivedTitle === "string"
        ? raw.derivedTitle.trim()
        : ""
  const updatedAt =
    typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : undefined
  return {
    key,
    ...(label ? { label } : {}),
    ...(displayName ? { displayName } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
    ...(raw.isMain === true ? { isMain: true } : {}),
  }
}

const mapSessionList = (payload: unknown): OpenClawSessionInfo[] =>
  extractSessionRows(payload)
    .map(mapSessionInfo)
    .filter((session): session is OpenClawSessionInfo => session !== null)

// 将 chat.history 结果中的单条消息映射为聊天消息（历史消息均为已完成态）。
const mapHistoryMessage = (
  raw: Record<string, unknown>,
  index: number,
): OpenClawChatMessage | null => {
  const source = isRecord(raw.message) ? raw.message : raw
  const roleRaw = typeof source.role === "string" ? source.role : ""
  if (roleRaw !== "user" && roleRaw !== "assistant" && roleRaw !== "system") return null
  const content =
    extractText(source.content) || (typeof source.text === "string" ? source.text : "")
  if (!content) return null
  const id =
    typeof source.id === "string" && source.id
      ? source.id
      : typeof raw.id === "string" && raw.id
        ? raw.id
        : `history-${index}`
  const timestampCandidates = [source.timestamp, source.at, source.createdAt, raw.timestamp, raw.at]
  const timestamp =
    timestampCandidates.find(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    ) ?? Date.now() + index
  const runId =
    typeof source.runId === "string" && source.runId
      ? source.runId
      : typeof raw.runId === "string" && raw.runId
        ? raw.runId
        : undefined
  return {
    id,
    role: roleRaw,
    content,
    timestamp,
    ...(runId ? { runId } : {}),
    status: "completed",
  }
}

const mapHistoryMessages = (payload: unknown): OpenClawChatMessage[] => {
  const messages = isRecord(payload) && Array.isArray(payload.messages) ? payload.messages : []
  return messages
    .map((raw, index) => (isRecord(raw) ? mapHistoryMessage(raw, index) : null))
    .filter((message): message is OpenClawChatMessage => message !== null)
}

export const openClawClientManager = new OpenClawClientManager()
