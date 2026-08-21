// Agent 领域 IPC channel。
export const AGENT_CHANNELS = {
  send: "agent:send",
  continue: "agent:continue",
  compact: "agent:compact",
  undoCompaction: "agent:undoCompaction",
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
  listPromptTemplates: "agent:listPromptTemplates",
  suggestedQuestions: "agent:suggestedQuestions",
  // 获取系统默认的桌面路径
  getDefaultPath: "agent:getDefaultPath",
  // 查询当前会话上下文容量（模型切换后状态栏主动刷新）。
  getContextUsage: "agent:getContextUsage",
  // 权限请求经 event 通道以 permission_request 事件推送（见 AgentEvent）。
  permissionResponse: "agent:permissionResponse",
  // 提问请求经 event 通道以 question_request 事件推送（见 AgentEvent）。
  questionResponse: "agent:questionResponse",
  // LSP 结果跳转：系统默认编辑器打开文件并定位行。
  openFileAt: "agent:openFileAt",
  // 会话导出与复制通道
  exportSession: "agent:exportSession",
  copySession: "agent:copySession",
  // 后台长任务作业管控通道
  listJobs: "agent:listJobs",
  killJob: "agent:killJob",
  removeJob: "agent:removeJob",
  clearSettledJobs: "agent:clearSettledJobs",
  readJobOutput: "agent:readJobOutput",
  // 查询会话装配的完整系统提示词与注入配置（执行流程面板展示用）。
  getPromptAssembly: "agent:getPromptAssembly",
  event: "agent:event",
} as const
