import type { OpenClawSessionSnapshot } from "@shared/contracts/openclaw"

// 员工在办公区/名册中的可视状态。
export type OfficeAgentStatus = "working" | "idle" | "connecting" | "offline" | "error" | "blocked"

/**
 * 将某个 Agent 的会话快照映射为办公室可视状态。
 */
export const resolveOfficeAgentStatus = (
  snapshot: OpenClawSessionSnapshot | undefined,
): OfficeAgentStatus => {
  if (!snapshot) return "offline"
  if (snapshot.isStreaming) return "working"
  switch (snapshot.connectionStatus) {
    case "connected":
      return "idle"
    case "connecting":
      return "connecting"
    case "pairing-required":
      return "blocked"
    case "error":
      return "error"
    default:
      return "offline"
  }
}
