// Agent 领域 IPC channel。
export const AGENT_CHANNELS = {
  send: "agent:send",
  abort: "agent:abort",
  restore: "agent:restore",
  listSessions: "agent:listSessions",
  restoreSession: "agent:restoreSession",
  event: "agent:event",
} as const
