// OpenClaw 运行时领域 IPC channel。
export const OPENCLAW_CHANNELS = {
  connect: "openclaw:connect",
  disconnect: "openclaw:disconnect",
  fetchAgents: "openclaw:fetch-agents",
  getSnapshot: "openclaw:get-snapshot",
  listSessions: "openclaw:list-sessions",
  createSession: "openclaw:create-session",
  sendMessage: "openclaw:send-message",
  abort: "openclaw:abort",
  // 主进程 → 渲染进程的会话事件广播。
  event: "openclaw:event",
} as const
