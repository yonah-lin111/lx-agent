import type { OpenClawChatMessage, OpenClawSessionSnapshot } from "@shared/contracts/openclaw"
import { useEffect, useMemo } from "react"
import {
  ensureOpenClawEventSubscription,
  openClawSessionKey,
  useOpenClawChatStore,
} from "../openclawChatStore"

// 时间线上的一条消息，附带来源 Agent。
export interface OfficeTimelineMessage {
  agentId: string
  message: OpenClawChatMessage
}

export interface OfficeAgentSession {
  agentId: string
  snapshot: OpenClawSessionSnapshot | undefined
}

export interface UseOpenClawOfficeResult {
  sessions: OfficeAgentSession[]
  timeline: OfficeTimelineMessage[]
  isAnyStreaming: boolean
}

/**
 * 合并各 Agent 的消息为单一时间线（仅视觉合并，底层会话仍相互隔离）。
 * 按时间戳升序，时间戳相同按消息 id 稳定排序。
 */
export const mergeOfficeTimeline = (
  sessions: readonly OfficeAgentSession[],
): OfficeTimelineMessage[] => {
  const merged: OfficeTimelineMessage[] = []
  for (const { agentId, snapshot } of sessions) {
    if (!snapshot) continue
    for (const message of snapshot.messages) {
      merged.push({ agentId, message })
    }
  }
  return merged.sort((a, b) => {
    if (a.message.timestamp !== b.message.timestamp) {
      return a.message.timestamp - b.message.timestamp
    }
    return a.message.id.localeCompare(b.message.id)
  })
}

/**
 * 聚合当前办公区内所有 Agent 的会话：
 * - 进入办公区时并发连接实例并为每个 Agent 加载会话快照（员工状态需要全量在线）；
 * - 合并所有 Agent 的消息为单一时间线（仅视觉合并，底层会话仍相互隔离）。
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
    void connect(instanceId)
    for (const agentId of agentIds) {
      void loadSession(instanceId, agentId)
    }
  }, [instanceId, agentIds])

  const sessions = useMemo<OfficeAgentSession[]>(
    () =>
      agentIds.map((agentId) => ({
        agentId,
        snapshot: storeSessions[openClawSessionKey(instanceId ?? "", agentId)],
      })),
    [agentIds, instanceId, storeSessions],
  )

  const timeline = useMemo<OfficeTimelineMessage[]>(() => mergeOfficeTimeline(sessions), [sessions])

  const isAnyStreaming = useMemo(
    () => sessions.some((session) => session.snapshot?.isStreaming),
    [sessions],
  )

  return { sessions, timeline, isAnyStreaming }
}
