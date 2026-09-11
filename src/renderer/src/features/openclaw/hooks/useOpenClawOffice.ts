import type { OpenClawChatMessage, OpenClawSessionSnapshot } from "@shared/contracts/openclaw"
import { useEffect, useMemo } from "react"
import {
  ensureOpenClawEventSubscription,
  openClawSessionKey,
  useOpenClawChatStore,
} from "../openclawChatStore"

// 时间线上的一条消息，附带来源 Agent 及扇出目标 Agents。
export interface OfficeTimelineMessage {
  agentId: string
  message: OpenClawChatMessage
  // 当用户消息发送给多个 Agent 时合并展示的目标 Agent 列表
  targetAgentIds?: string[]
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
 * 针对向多个 Agent 发送的同批次 User 消息，进行去重合并，并汇集 targetAgentIds。
 */
export const mergeOfficeTimeline = (
  sessions: readonly OfficeAgentSession[],
): OfficeTimelineMessage[] => {
  const rawList: OfficeTimelineMessage[] = []
  for (const { agentId, snapshot } of sessions) {
    if (!snapshot) continue
    for (const message of snapshot.messages) {
      rawList.push({ agentId, message })
    }
  }

  rawList.sort((a, b) => {
    if (a.message.timestamp !== b.message.timestamp) {
      return a.message.timestamp - b.message.timestamp
    }
    return a.message.id.localeCompare(b.message.id)
  })

  // 合并相同时间戳（或相差极短 1500ms 内且内容一致）的用户消息
  const merged: OfficeTimelineMessage[] = []
  for (const item of rawList) {
    if (item.message.role === "user") {
      const prev = merged[merged.length - 1]
      if (
        prev &&
        prev.message.role === "user" &&
        prev.message.content === item.message.content &&
        Math.abs(prev.message.timestamp - item.message.timestamp) <= 1500
      ) {
        const existingTargets = prev.targetAgentIds ?? [prev.agentId]
        if (!existingTargets.includes(item.agentId)) {
          prev.targetAgentIds = [...existingTargets, item.agentId]
        }
        continue
      }
      merged.push({
        ...item,
        targetAgentIds: [item.agentId],
      })
    } else {
      merged.push(item)
    }
  }

  return merged
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

  const timeline = useMemo<OfficeTimelineMessage[]>(() => mergeOfficeTimeline(sessions), [sessions])

  const isAnyStreaming = useMemo(
    () => sessions.some((session) => session.snapshot?.isStreaming),
    [sessions],
  )

  return { sessions, timeline, isAnyStreaming }
}
