// OpenClaw 运行时领域契约：会话状态、聊天消息与 preload API。
// 配置侧（实例与 Agent 列表）定义在 @shared/settings。

import type { OpenClawAgentItem } from "@shared/settings"

// 与某个 Gateway 的连接状态。
export type OpenClawConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "pairing-required"
  | "error"

// 聊天消息角色。
export type OpenClawChatRole = "user" | "assistant" | "system"

// 单条聊天消息。
export interface OpenClawChatMessage {
  id: string
  role: OpenClawChatRole
  content: string
  timestamp: number
  // 关联的 OpenClaw run（用户消息在 run 建立前为空）。
  runId?: string
  status: "pending" | "streaming" | "completed" | "error"
  error?: string
  // 需要渲染进程本地化的消息类型；content 存放该类型的参数（如 requestId）。
  code?: "approval-required"
}

// Gateway 会话摘要（sessions.list / sessions.create 投影）。
export interface OpenClawSessionInfo {
  key: string
  label?: string
  displayName?: string
  updatedAt?: number
  // Gateway 标记的主会话。
  isMain?: boolean
}

// 某个 (instanceId, agentId) 会话的权威快照，由主进程维护。
export interface OpenClawSessionSnapshot {
  instanceId: string
  agentId: string
  // 绑定到该 Agent 的 Gateway 会话 key；null 表示尚未绑定。
  sessionKey: string | null
  connectionStatus: OpenClawConnectionStatus
  connectionError?: string
  // 远端设备配对待审批时的 requestId。
  pairingRequestId?: string
  isStreaming: boolean
  messages: OpenClawChatMessage[]
}

// 主进程推送给渲染进程的会话事件。
// - snapshot：结构性变化（连接状态、消息增删、重置），整体替换。
// - message-update：单条消息内容更新（流式追加），按 id 覆盖。
export type OpenClawSessionEvent =
  | { kind: "snapshot"; instanceId: string; agentId: string; snapshot: OpenClawSessionSnapshot }
  | { kind: "message-update"; instanceId: string; agentId: string; message: OpenClawChatMessage }

// 连接结果。
export interface OpenClawConnectResult {
  status: OpenClawConnectionStatus
  error?: string
  pairingRequestId?: string
}

// 发送任务入参。
export interface OpenClawSendMessageInput {
  instanceId: string
  agentId: string
  message: string
}

// OpenClaw 领域 Preload API。
export interface OpenClawApi {
  openclaw: {
    // 建立到指定实例的 Gateway 连接（幂等）。
    connect: (instanceId: string) => Promise<OpenClawConnectResult>
    // 断开指定实例的连接并清理其会话状态。
    disconnect: (instanceId: string) => Promise<void>
    // 探测实例下注册的 Agent 列表。
    fetchAgents: (
      instanceId: string,
    ) => Promise<OpenClawConnectResult & { agents: OpenClawAgentItem[] }>
    // 读取指定会话的权威快照；绑定时会从 Gateway 水合历史消息。
    getSnapshot: (instanceId: string, agentId: string) => Promise<OpenClawSessionSnapshot>
    // 列出该 Agent 在 Gateway 上已有的会话（设置页绑定发现）。
    listSessions: (instanceId: string, agentId: string) => Promise<OpenClawSessionInfo[]>
    // 为该 Agent 新建一条 Gateway 会话并立即绑定。
    createSession: (instanceId: string, agentId: string) => Promise<OpenClawSessionInfo>
    // 向该 Agent 绑定的会话发送一条任务。
    sendMessage: (input: OpenClawSendMessageInput) => Promise<void>
    // 中止该会话进行中的 run。
    abort: (instanceId: string, agentId: string) => Promise<void>
    // 订阅会话事件，返回退订函数。
    onEvent: (handler: (event: OpenClawSessionEvent) => void) => () => void
  }
}
