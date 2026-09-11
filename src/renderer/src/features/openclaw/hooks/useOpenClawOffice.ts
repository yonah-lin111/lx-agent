import type { OpenClawSessionSnapshot } from "@shared/contracts/openclaw"
import { useEffect, useMemo } from "react"
import {
  ensureOpenClawEventSubscription,
  openClawSessionKey,
  useOpenClawChatStore,
} from "../openclawChatStore"

export interface OfficeAgentSession {
  agentId: string
  snapshot: OpenClawSessionSnapshot | undefined
}

export interface UseOpenClawOfficeResult {
  sessions: OfficeAgentSession[]
  isAnyStreaming: boolean
}

/**
 * 聚合当前办公区内所有 Agent 的会话：
 * - 进入办公区时并发连接实例并为每个 Agent 加载会话快照（员工状态需要全量在线）；
 * - 会话之间相互隔离，页面只查看当前选中员工的那一条。
 */
export const useOpenClawOffice = (
  instanceId: string | null,
  agentIds: readonly string[],
): UseOpenClawOfficeResult => {
  const storeSessions = useOpenClawChatStore((state) => state.sessions)

  // 事件订阅只需建立一次。
  useEffect(() => {
    ensureOpenClawEventSubscription()
  }, [])

  // 办公区或员工集合变化时：连接实例并加载各 Agent 的会话快照。
  // 说明：调用方需保证 agentIds 引用稳定（透传 useMemo 结果）。
  useEffect(() => {
    if (!instanceId || agentIds.length === 0) return
    const { connect, loadSession } = useOpenClawChatStore.getState()
    void (async () => {
      // 先加载 snapshot 使得 sessions 数组有初始占位，然后再并发触发 connect 获得真实状态
      await Promise.all(agentIds.map((agentId) => loadSession(instanceId, agentId)))
      await connect(instanceId)
    })()
  }, [instanceId, agentIds])

  const sessions = useMemo<OfficeAgentSession[]>(
    () =>
      agentIds.map((agentId) => ({
        agentId,
        snapshot: storeSessions[openClawSessionKey(instanceId ?? "", agentId)],
      })),
    [agentIds, instanceId, storeSessions],
  )

  const isAnyStreaming = useMemo(
    () => sessions.some((session) => session.snapshot?.isStreaming),
    [sessions],
  )

  return { sessions, isAnyStreaming }
}
