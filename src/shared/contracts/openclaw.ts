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

// 附件仅支持图片：网关 agent 入口 acceptNonImage=false，非图片附件会被整条拒绝。
export const OPENCLAW_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const

// 单张图片上限：对齐网关 MAX_IMAGE_BYTES（6MB）。
export const OPENCLAW_MAX_IMAGE_BYTES = 6 * 1024 * 1024

// 单条消息附件总量上限：base64 膨胀约 1.37 倍，为 25MiB maxPayload 留出帧余量。
export const OPENCLAW_MAX_ATTACHMENT_TOTAL_BYTES = 16 * 1024 * 1024

// 附件扩展名是否在图片白名单内（渲染进程入口与主进程发送前共用同一判定）。
export const isOpenClawImageExtension = (extension: string): boolean =>
  (OPENCLAW_IMAGE_EXTENSIONS as readonly string[]).includes(extension.toLowerCase())

// 随消息发送/展示的附件（不含文件内容，base64 由主进程按 path 读取）。
export interface OpenClawAttachmentFile {
  name: string
  path: string
  type: "image" | "text"
  // 原始字节数：渲染进程用于总量预校验与展示，主进程以 fs.stat 为准。
  sizeBytes?: number
}

// 单条消息的 token 用量（Gateway 消息自带）。
export interface OpenClawMessageUsage {
  input?: number
  output?: number
}

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
  // 该条消息生成时的模型（assistant 消息，历史水合与 run 结束回填）。
  model?: string
  modelProvider?: string
  // 该条消息的 token 用量（assistant 消息，历史水合与 run 结束回填）。
  usage?: OpenClawMessageUsage
  // 该条消息携带的附件（仅本地乐观消息持有；网关历史不回传附件）。
  files?: OpenClawAttachmentFile[]
}

// 会话级模型与上下文用量（Gateway sessions.describe 投影）。
export interface OpenClawSessionStats {
  // 当前服务该会话的模型（运行时 activeModel 优先，回退选中模型）。
  model?: string
  modelProvider?: string
  // 上下文已用 token（Gateway pre-prompt 估算）。
  contextUsed?: number
  // 上下文窗口容量 token。
  contextWindow?: number
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
  // 会话级模型与上下文用量；未绑定会话或 Gateway 未提供时为空。
  stats?: OpenClawSessionStats
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
  // 附件（仅图片）：主进程读取并编码为 base64 随 agent 请求下发。
  files?: OpenClawAttachmentFile[]
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
    // 删除某条助手消息所在的一轮问答（云端 rewind：该轮用户消息及其后的消息一并删除）。
    deleteTurn: (instanceId: string, agentId: string, assistantMessageId: string) => Promise<void>
    // 中止该会话进行中的 run。
    abort: (instanceId: string, agentId: string) => Promise<void>
    // 订阅会话事件，返回退订函数。
    onEvent: (handler: (event: OpenClawSessionEvent) => void) => () => void
  }
}
