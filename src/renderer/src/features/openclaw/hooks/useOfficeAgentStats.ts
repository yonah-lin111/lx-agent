import type { OpenClawSessionStats } from "@shared/contracts/openclaw"
import { useMemo } from "react"
import { openClawSessionKey, useOpenClawChatStore } from "@/features/openclaw/openclawChatStore"

/**
 * 只读订阅当前办公区内各 Agent 的会话级模型与上下文用量（不触发连接/加载，供名册展示）。
 */
export const useOfficeAgentStats = (
  instanceId: string | null,
  agentIds: readonly string[],
): Record<string, OpenClawSessionStats | undefined> => {
  const sessions = useOpenClawChatStore((state) => state.sessions)

  return useMemo(() => {
    const result: Record<string, OpenClawSessionStats | undefined> = {}
    if (!instanceId) return result
    for (const agentId of agentIds) {
      result[agentId] = sessions[openClawSessionKey(instanceId, agentId)]?.stats
    }
    return result
  }, [sessions, instanceId, agentIds])
}
