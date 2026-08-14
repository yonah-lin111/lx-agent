// Agent 领域 IPC channel。
export const AGENT_CHANNELS = {
  send: "agent:send",
  continue: "agent:continue",
  abort: "agent:abort",
  switchWorktree: "agent:switchWorktree",
  restore: "agent:restore",
  listSessions: "agent:listSessions",
  restoreSession: "agent:restoreSession",
  renameSession: "agent:renameSession",
  deleteSession: "agent:deleteSession",
  deleteMessageTurn: "agent:deleteMessageTurn",
  forkSession: "agent:forkSession",
  getMcpStatus: "agent:getMcpStatus",
  getLspStatus: "agent:getLspStatus",
  installLspServers: "agent:installLspServers",
  suggestedQuestions: "agent:suggestedQuestions",
  // 查询当前会话上下文容量（模型切换后状态栏主动刷新）。
  getContextUsage: "agent:getContextUsage",
  // 权限请求经 event 通道以 permission_request 事件推送（见 AgentEvent）。
  permissionResponse: "agent:permissionResponse",
  // 提问请求经 event 通道以 question_request 事件推送（见 AgentEvent）。
  questionResponse: "agent:questionResponse",
  // LSP 结果跳转：系统默认编辑器打开文件并定位行。
  openFileAt: "agent:openFileAt",
  event: "agent:event",
} as const
