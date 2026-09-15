import type { GatewayClient } from "@openclaw/gateway-client"
import type { EventFrame } from "@openclaw/gateway-protocol/frame-guards"
import type {
  OpenClawChatMessage,
  OpenClawConnectionStatus,
  OpenClawConnectResult,
  OpenClawSessionEvent,
  OpenClawSessionSnapshot,
  OpenClawSessionStats,
} from "@shared/contracts/openclaw"
import type { OpenClawInstanceConfig } from "@shared/settings"

// 单个 Agent 会话的运行时状态。
export interface AgentSession {
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
  // 会话级模型与上下文用量（来自 sessions.describe，best-effort）。
  stats: OpenClawSessionStats | null
}

// 单个实例的连接状态。
export interface InstanceConnection {
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

// 模块间协作面：openclawClientManager/ 下各模块通过该接口回调管理器持有的运行态。
export interface OpenClawClientManagerHost {
  readonly connections: Map<string, InstanceConnection>
  readonly eventSink: ((event: OpenClawSessionEvent) => void) | null
  emitSnapshot(connection: InstanceConnection, session: AgentSession): void
  toSnapshot(connection: InstanceConnection, session: AgentSession): OpenClawSessionSnapshot
  handleEvent(connection: InstanceConnection, event: EventFrame): void
  connect(instanceId: string): Promise<OpenClawConnectResult>
  getOrCreateConnection(instanceId: string): InstanceConnection
  refreshConnectionConfig(connection: InstanceConnection): void
  findSessionByKey(connection: InstanceConnection, sessionKey: string): AgentSession | null
  refreshStats(connection: InstanceConnection, session: AgentSession): Promise<void>
}
