// Agent 领域 IPC channel。
export const AGENT_CHANNELS = {
  send: "agent:send",
  abort: "agent:abort",
  restore: "agent:restore",
  listSessions: "agent:listSessions",
  restoreSession: "agent:restoreSession",
  renameSession: "agent:renameSession",
  deleteSession: "agent:deleteSession",
  deleteMessageTurn: "agent:deleteMessageTurn",
  getMcpStatus: "agent:getMcpStatus",
  // 权限请求经 event 通道以 permission_request 事件推送（见 AgentEvent）。
  permissionResponse: "agent:permissionResponse",
  event: "agent:event",
} as const
