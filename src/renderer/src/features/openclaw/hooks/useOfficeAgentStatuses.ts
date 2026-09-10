import { useMemo } from "react"
import { type OfficeAgentStatus, resolveOfficeAgentStatus } from "../agentStatus"
import { openClawSessionKey, useOpenClawChatStore } from "../openclawChatStore"

/**
 * 只读订阅当前办公区内各 Agent 的可视状态（不触发连接/加载，供名册与工作区使用）。
 */
export const useOfficeAgentStatuses = (
  instanceId: string | null,
  agentIds: readonly string[],
): Record<string, OfficeAgentStatus> => {
  const sessions = useOpenClawChatStore((state) => state.sessions)

  return useMemo(() => {
    const result: Record<string, OfficeAgentStatus> = {}
    if (!instanceId) return result
    for (const agentId of agentIds) {
      result[agentId] = resolveOfficeAgentStatus(sessions[openClawSessionKey(instanceId, agentId)])
    }
    return result
  }, [sessions, instanceId, agentIds])
}
