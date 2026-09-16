import type { EventFrame } from "@openclaw/gateway-protocol/frame-guards"
import type {
  OpenClawConnectResult,
  OpenClawSendMessageInput,
  OpenClawSessionEvent,
  OpenClawSessionInfo,
  OpenClawSessionSnapshot,
} from "@shared/contracts/openclaw"
import type { OpenClawAgentItem } from "@shared/settings"
import {
  connect,
  disconnect,
  disposeAll,
  getOrCreateConnection,
  refreshConnectionConfig,
} from "./connectionFlow"
import { emitSnapshot, handleEvent, toSnapshot } from "./eventProjection"
import {
  abort,
  createSession,
  deleteTurn,
  fetchAgents,
  findSessionByKey,
  getSnapshot,
  listSessions,
  refreshStats,
  sendMessage,
} from "./sessionRuntime"
import type { AgentSession, InstanceConnection, OpenClawClientManagerHost } from "./types"

/**
 * OpenClaw Gateway 连接池与会话状态管理器（主进程权威）。
 *
 * 每个实例维护一条 WebSocket 连接；每个 (instanceId, agentId) 维护一条
 * 绑定到 Gateway 会话 key 的投影（key 由设置显式绑定，未绑定时不可发送）。
 * 连接与消息状态全部由本管理器持有，渲染进程仅接收事件投影。
 */
export class OpenClawClientManager implements OpenClawClientManagerHost {
  // 内部协作面：连接池与会话投影由本类独占持有，模块经 host 读取/改写。
  connections = new Map<string, InstanceConnection>()
  eventSink: ((event: OpenClawSessionEvent) => void) | null = null

  // 注册渲染进程事件出口。
  setEventSink(sink: (event: OpenClawSessionEvent) => void): void {
    this.eventSink = sink
  }

  // ---- 内部协作面：openclawClientManager/ 模块的跨模块回调入口 ----

  emitSnapshot(connection: InstanceConnection, session: AgentSession): void {
    emitSnapshot(this, connection, session)
  }

  toSnapshot(connection: InstanceConnection, session: AgentSession): OpenClawSessionSnapshot {
    return toSnapshot(connection, session)
  }

  handleEvent(connection: InstanceConnection, event: EventFrame): void {
    handleEvent(this, connection, event)
  }

  getOrCreateConnection(instanceId: string): InstanceConnection {
    return getOrCreateConnection(this, instanceId)
  }

  refreshConnectionConfig(connection: InstanceConnection): void {
    refreshConnectionConfig(connection)
  }

  findSessionByKey(connection: InstanceConnection, sessionKey: string): AgentSession | null {
    return findSessionByKey(connection, sessionKey)
  }

  async refreshStats(connection: InstanceConnection, session: AgentSession): Promise<void> {
    return refreshStats(this, connection, session)
  }

  // ---- 公共 API ----

  async connect(instanceId: string): Promise<OpenClawConnectResult> {
    return connect(this, instanceId)
  }

  async disconnect(instanceId: string): Promise<void> {
    await disconnect(this, instanceId)
  }

  async fetchAgents(
    instanceId: string,
  ): Promise<OpenClawConnectResult & { agents: OpenClawAgentItem[] }> {
    return fetchAgents(this, instanceId)
  }

  async getSnapshot(instanceId: string, agentId: string): Promise<OpenClawSessionSnapshot> {
    return getSnapshot(this, instanceId, agentId)
  }

  async listSessions(instanceId: string, agentId: string): Promise<OpenClawSessionInfo[]> {
    return listSessions(this, instanceId, agentId)
  }

  async createSession(instanceId: string, agentId: string): Promise<OpenClawSessionInfo> {
    return createSession(this, instanceId, agentId)
  }

  async sendMessage(input: OpenClawSendMessageInput): Promise<void> {
    await sendMessage(this, input)
  }

  async abort(instanceId: string, agentId: string): Promise<void> {
    await abort(this, instanceId, agentId)
  }

  async deleteTurn(instanceId: string, agentId: string, assistantMessageId: string): Promise<void> {
    await deleteTurn(this, instanceId, agentId, assistantMessageId)
  }

  disposeAll(): void {
    disposeAll(this)
  }
}
