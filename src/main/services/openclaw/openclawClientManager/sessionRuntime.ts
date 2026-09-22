import { randomUUID } from "node:crypto"
import type { GatewayClient } from "@openclaw/gateway-client"
import type {
  OpenClawChatMessage,
  OpenClawConnectResult,
  OpenClawSendMessageInput,
  OpenClawSessionInfo,
  OpenClawSessionSnapshot,
} from "@shared/contracts/openclaw"
import type { OpenClawAgentItem } from "@shared/settings"
import { getOpenClawSettings, saveOpenClawSettings } from "@/services/settingsService"
import { resolveOpenClawAttachments } from "./attachments"
import { AGENT_RUN_TIMEOUT_MS, HISTORY_LIMIT, SESSION_LIST_LIMIT } from "./constants"
import { mapAgent, mapHistoryMessages, mapSessionList, mapSessionStats } from "./payloadMappers"
import type { AgentSession, InstanceConnection, OpenClawClientManagerHost } from "./types"

// 从实例配置解析该 Agent 绑定的会话 key。
export function resolveBoundSessionKey(
  connection: InstanceConnection,
  agentId: string,
): string | null {
  const agent = connection.config.agents.find((item) => item.id === agentId)
  const key = agent?.sessionKey?.trim()
  return key ? key : null
}

// 配置中的绑定变化时重置该 Agent 的会话投影。
export function syncSessionBinding(connection: InstanceConnection, session: AgentSession): void {
  const bound = resolveBoundSessionKey(connection, session.agentId)
  if (session.sessionKey === bound) return
  session.sessionKey = bound
  session.messages = []
  session.isStreaming = false
  session.activeRunId = null
  session.subscribed = false
  session.hydrated = false
  session.stats = null
}

// 读取（必要时创建）某个 Agent 的会话投影。
export function getOrCreateSession(connection: InstanceConnection, agentId: string): AgentSession {
  const existing = connection.sessions.get(agentId)
  if (existing) return existing

  const session: AgentSession = {
    agentId,
    sessionKey: resolveBoundSessionKey(connection, agentId),
    messages: [],
    isStreaming: false,
    activeRunId: null,
    subscribed: false,
    hydrated: false,
    stats: null,
  }
  connection.sessions.set(agentId, session)
  return session
}

// 通过 sessionKey 定位会话。
export function findSessionByKey(
  connection: InstanceConnection,
  sessionKey: string,
): AgentSession | null {
  for (const session of connection.sessions.values()) {
    if (session.sessionKey === sessionKey) return session
  }
  return null
}

/**
 * 探测实例下注册的 Agent 列表。
 */
export async function fetchAgents(
  host: OpenClawClientManagerHost,
  instanceId: string,
): Promise<OpenClawConnectResult & { agents: OpenClawAgentItem[] }> {
  const connected = await host.connect(instanceId)
  if (connected.status !== "connected") return { ...connected, agents: [] }

  const connection = host.connections.get(instanceId)
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
export async function getSnapshot(
  host: OpenClawClientManagerHost,
  instanceId: string,
  agentId: string,
): Promise<OpenClawSessionSnapshot> {
  const connection = host.getOrCreateConnection(instanceId)
  host.refreshConnectionConfig(connection)
  const session = getOrCreateSession(connection, agentId)
  syncSessionBinding(connection, session)
  await hydrateSession(host, connection, session)
  return host.toSnapshot(connection, session)
}

/**
 * 列出该 Agent 在 Gateway 上已有的会话（绑定发现）。
 */
export async function listSessions(
  host: OpenClawClientManagerHost,
  instanceId: string,
  agentId: string,
): Promise<OpenClawSessionInfo[]> {
  const connected = await host.connect(instanceId)
  if (connected.status !== "connected") {
    throw new Error(connected.error || "OpenClaw connection is not ready")
  }
  const connection = host.connections.get(instanceId)
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
export async function createSession(
  host: OpenClawClientManagerHost,
  instanceId: string,
  agentId: string,
): Promise<OpenClawSessionInfo> {
  const connected = await host.connect(instanceId)
  if (connected.status !== "connected") {
    throw new Error(connected.error || "OpenClaw connection is not ready")
  }
  const connection = host.connections.get(instanceId)
  const client = connection?.client
  if (!connection || !client) throw new Error("OpenClaw connection is not ready")

  const { key, displayName } = await mintSession(connection, client, agentId)
  await bindSession(host, instanceId, agentId, key)
  return { key, ...(displayName ? { displayName } : {}) }
}

/**
 * 向 Gateway 申请新会话 key；dynamic scope 不可用时回退为本地生成
 * （发送首条消息时由 Gateway 自动建会话）。
 */
export async function mintSession(
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
      const displayName = typeof payload?.displayName === "string" ? payload.displayName.trim() : ""
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
 * 将该 Agent 绑定到指定 Gateway 会话并持久化到配置（仅内部使用）。
 */
export async function bindSession(
  host: OpenClawClientManagerHost,
  instanceId: string,
  agentId: string,
  sessionKey: string,
): Promise<void> {
  const key = sessionKey.trim()
  if (!key) throw new Error("Session key is required")

  const connection = host.getOrCreateConnection(instanceId)
  host.refreshConnectionConfig(connection)
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

  const session = getOrCreateSession(connection, agentId)
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
  session.stats = null
  host.emitSnapshot(connection, session)

  await hydrateSession(host, connection, session)
}

/**
 * 向该 Agent 绑定的会话发送任务，并在该会话内流式接收回复。
 */
export async function sendMessage(
  host: OpenClawClientManagerHost,
  input: OpenClawSendMessageInput,
): Promise<void> {
  const { instanceId, agentId, message, files } = input
  // 附件校验/读取先于本地乐观消息：失败时不留不存在任务的消息。
  const attachments = await resolveOpenClawAttachments(files)
  const connected = await host.connect(instanceId)
  if (connected.status !== "connected") {
    throw new Error(connected.error || "OpenClaw connection is not ready")
  }

  const connection = host.connections.get(instanceId)
  const client = connection?.client
  if (!connection || !client) throw new Error("OpenClaw connection is not ready")

  const session = getOrCreateSession(connection, agentId)
  syncSessionBinding(connection, session)
  if (session.isStreaming) {
    throw new Error("This agent is already running a task")
  }
  let sessionKey = session.sessionKey
  if (!sessionKey) {
    // 未绑定会话时自动新建并持久化绑定，避免发送死角。
    const created = await createSession(host, instanceId, agentId)
    sessionKey = created.key
  }

  session.messages.push({
    id: randomUUID(),
    role: "user",
    content: message,
    timestamp: Date.now(),
    status: "completed",
    ...(files && files.length > 0 ? { files: files.map((file) => ({ ...file })) } : {}),
  })
  session.isStreaming = true
  session.activeRunId = null
  host.emitSnapshot(connection, session)

  await ensureSubscribed(session, client)

  // 网关 agent 入口拒收非图片附件（acceptNonImage=false）：带附件的消息统一走 chat.send，
  // 无附件保持 agent。两者都是"受理即返回"，run 结束由事件流收敛。
  const hasAttachments = attachments.length > 0
  void client
    .request(
      hasAttachments ? "chat.send" : "agent",
      hasAttachments
        ? { sessionKey, agentId, message, attachments, idempotencyKey: randomUUID() }
        : { agentId, sessionKey, message, idempotencyKey: randomUUID() },
      { timeoutMs: AGENT_RUN_TIMEOUT_MS },
    )
    .then(() => {
      session.isStreaming = false
      session.activeRunId = null
      for (const msg of session.messages) {
        if (msg.role === "assistant" && msg.status === "streaming") msg.status = "completed"
      }
      host.emitSnapshot(connection, session)
      void refreshStats(host, connection, session)
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
      host.emitSnapshot(connection, session)
      void refreshStats(host, connection, session)
    })
}

/**
 * 在最新云端历史中解析该轮用户消息的真实 entryId（本地乐观 id 与 runId 均在此兜底）。
 */
const resolveRewindEntryId = async (
  client: GatewayClient,
  sessionKey: string,
  userMessage: OpenClawChatMessage,
  assistantMessageId: string,
): Promise<string | null> => {
  const payload = await client.request<unknown>("chat.history", {
    sessionKey,
    limit: HISTORY_LIMIT,
  })
  const entries = mapHistoryMessages(payload)

  const byId = entries.find((entry) => entry.id === userMessage.id)
  if (byId) return byId.id

  // 本次运行新产出的助手消息 id 为 runId：定位该 run 的条目，取其之前最近一条用户消息。
  const runIndex = entries.findIndex((entry) => entry.runId === assistantMessageId)
  if (runIndex > 0) {
    const precedingUser = entries.findLast(
      (entry, index) => index < runIndex && entry.role === "user",
    )
    if (precedingUser) return precedingUser.id
  }

  // 本地乐观用户消息（随机 UUID）：按内容一致 + 时间戳最近匹配。
  const candidates = entries.filter(
    (entry) => entry.role === "user" && entry.content === userMessage.content,
  )
  if (candidates.length === 0) return null
  candidates.sort(
    (a, b) =>
      Math.abs(a.timestamp - userMessage.timestamp) - Math.abs(b.timestamp - userMessage.timestamp),
  )
  return candidates[0].id
}

/**
 * 删除指定助手消息所在的一轮问答。
 *
 * 云端无单条删除能力：以 sessions.rewind 回退到该轮用户消息的 entry，
 * 该用户消息及其后的全部消息由云端移除。entryId 先按渲染层 id 直传，
 * 失败时从最新 chat.history 解析（id → runId → 内容+时间戳）后重试一次。
 */
export async function deleteTurn(
  host: OpenClawClientManagerHost,
  instanceId: string,
  agentId: string,
  assistantMessageId: string,
): Promise<void> {
  const connected = await host.connect(instanceId)
  if (connected.status !== "connected") {
    throw new Error(connected.error || "OpenClaw connection is not ready")
  }

  const connection = host.connections.get(instanceId)
  const client = connection?.client
  if (!connection || !client) throw new Error("OpenClaw connection is not ready")

  const session = getOrCreateSession(connection, agentId)
  syncSessionBinding(connection, session)
  const sessionKey = session.sessionKey
  if (!sessionKey) throw new Error("OpenClaw session is not bound")
  if (session.isStreaming) throw new Error("This agent is already running a task")

  const assistantIndex = session.messages.findIndex((message) => message.id === assistantMessageId)
  if (assistantIndex < 0) throw new Error("Message not found in session")
  const userIndex = session.messages.findLastIndex(
    (message, index) => index < assistantIndex && message.role === "user",
  )
  if (userIndex < 0) throw new Error("Turn has no user message")
  const userMessage = session.messages[userIndex]

  const rewind = (entryId: string): Promise<unknown> =>
    client.request("sessions.rewind", { sessionKey, entryId })

  try {
    await rewind(userMessage.id)
  } catch (error) {
    let resolvedEntryId: string | null = null
    try {
      resolvedEntryId = await resolveRewindEntryId(
        client,
        sessionKey,
        userMessage,
        assistantMessageId,
      )
    } catch {
      resolvedEntryId = null
    }
    if (!resolvedEntryId || resolvedEntryId === userMessage.id) throw error
    await rewind(resolvedEntryId)
  }

  // 云端已截断：本地同步截断该轮及其后消息，再以最新历史覆盖投影（id 权威化）。
  session.messages = session.messages.slice(0, userIndex)
  host.emitSnapshot(connection, session)
  session.hydrated = false
  await hydrateSession(host, connection, session)
}

/**
 * 中止该会话进行中的 run。
 */
export async function abort(
  host: OpenClawClientManagerHost,
  instanceId: string,
  agentId: string,
): Promise<void> {
  const connection = host.connections.get(instanceId)
  const client = connection?.client
  if (!connection || !client) return
  const session = getOrCreateSession(connection, agentId)
  syncSessionBinding(connection, session)
  if (!session.sessionKey) return
  try {
    await client.request("sessions.abort", { key: session.sessionKey })
  } catch {
    // 无进行中的 run 时静默忽略。
  }
  session.isStreaming = false
  session.activeRunId = null
  host.emitSnapshot(connection, session)
  void refreshStats(host, connection, session)
}

// 从 Gateway 水合绑定会话的历史消息，并建立外部消息订阅。
export async function hydrateSession(
  host: OpenClawClientManagerHost,
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
    host.emitSnapshot(connection, session)
    await ensureSubscribed(session, client)
    await refreshStats(host, connection, session)
  } catch (error) {
    console.warn(`[OpenClaw] Failed to hydrate session ${sessionKey}:`, error)
  }
}

// 从 Gateway 拉取会话级模型与上下文用量，变化时推送快照（best-effort）。
export async function refreshStats(
  host: OpenClawClientManagerHost,
  connection: InstanceConnection,
  session: AgentSession,
): Promise<void> {
  const client = connection.client
  const sessionKey = session.sessionKey
  if (!client || !sessionKey || connection.status !== "connected") return
  try {
    const payload = await client.request<unknown>("sessions.describe", {
      key: sessionKey,
      agentId: session.agentId,
    })
    if (session.sessionKey !== sessionKey) return
    const stats = mapSessionStats(payload)
    if (!stats || JSON.stringify(stats) === JSON.stringify(session.stats)) return
    session.stats = stats
    host.emitSnapshot(connection, session)
  } catch (error) {
    console.warn(`[OpenClaw] Failed to refresh stats for ${sessionKey}:`, error)
  }
}

// 确保会话消息订阅已建立。
export async function ensureSubscribed(
  session: AgentSession,
  client: GatewayClient,
): Promise<void> {
  if (session.subscribed || !session.sessionKey) return
  try {
    await client.request("sessions.messages.subscribe", { key: session.sessionKey })
    session.subscribed = true
  } catch {
    // 订阅失败不阻塞发送：事件仍可能由 Gateway 推送。
  }
}
