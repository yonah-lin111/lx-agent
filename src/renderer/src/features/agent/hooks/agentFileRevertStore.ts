import type { AgentFileRevertMark } from "@shared/contracts/agent"
import { useSyncExternalStore } from "react"

// 会话 → 已回退文件标记（按 (轮次, 文件) 唯一；与服务端快照行标记同构）。
let marksBySession: Record<string, AgentFileRevertMark[]> = {}
const listeners = new Set<() => void>()

// 稳定空数组引用（useSyncExternalStore 快照要求引用稳定）。
const EMPTY_MARKS: AgentFileRevertMark[] = []

// 标记键：(轮次时间戳, 相对路径)。
const markKey = (mark: AgentFileRevertMark): string => `${mark.userMessageTimestamp}:${mark.file}`

const notify = (): void => {
  listeners.forEach((listener) => listener())
}

/**
 * 文件回退标记存储：restore 载荷 hydrate，回退/删轮增量更新；
 * 卡片标记与 flowlist 回退 item 共用同一数据源（消息列表与执行流无需 prop 钻取）。
 */
export const agentFileRevertStore = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  // 指定会话的标记（无会话/无标记返回稳定空数组）。
  getMarks: (sessionId: string | null | undefined): AgentFileRevertMark[] =>
    sessionId ? (marksBySession[sessionId] ?? EMPTY_MARKS) : EMPTY_MARKS,

  // 全量替换（restore 时使用）。
  setSessionMarks: (sessionId: string, marks: AgentFileRevertMark[]): void => {
    marksBySession = { ...marksBySession, [sessionId]: marks }
    notify()
  },

  // 增量追加/刷新标记（按 (轮次, 文件) 覆盖）。
  addMarks: (sessionId: string, marks: AgentFileRevertMark[]): void => {
    if (marks.length === 0) return
    const merged = new Map((marksBySession[sessionId] ?? []).map((mark) => [markKey(mark), mark]))
    for (const mark of marks) {
      merged.set(markKey(mark), mark)
    }
    marksBySession = { ...marksBySession, [sessionId]: [...merged.values()] }
    notify()
  },

  // 删除某轮标记（该轮被删除/撤销时调用；源轮消失则回退 item 与卡片标记一并消失）。
  removeTurnMarks: (sessionId: string, userMessageTimestamp: number): void => {
    const current = marksBySession[sessionId]
    if (!current) return
    marksBySession = {
      ...marksBySession,
      [sessionId]: current.filter((mark) => mark.userMessageTimestamp !== userMessageTimestamp),
    }
    notify()
  },

  // 清空会话标记（会话删除）。
  clearSession: (sessionId: string): void => {
    if (!marksBySession[sessionId]) return
    const next = { ...marksBySession }
    delete next[sessionId]
    marksBySession = next
    notify()
  },
}

// 订阅指定会话的已回退文件标记。
export const useAgentFileReverts = (sessionId?: string | null): AgentFileRevertMark[] =>
  useSyncExternalStore(agentFileRevertStore.subscribe, () =>
    agentFileRevertStore.getMarks(sessionId),
  )
