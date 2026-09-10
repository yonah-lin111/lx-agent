// OpenClaw 运行时领域 IPC channel。
export const OPENCLAW_CHANNELS = {
  connect: "openclaw:connect",
  disconnect: "openclaw:disconnect",
  fetchAgents: "openclaw:fetch-agents",
  getSnapshot: "openclaw:get-snapshot",
  sendMessage: "openclaw:send-message",
  abort: "openclaw:abort",
  clearMessages: "openclaw:clear-messages",
  resetSession: "openclaw:reset-session",
  // 主进程 → 渲染进程的会话事件广播。
  event: "openclaw:event",
} as const
