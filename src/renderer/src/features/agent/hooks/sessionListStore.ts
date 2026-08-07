import type {
  AgentSendContext,
  AgentSessionFilter,
  AgentSessionSummary,
} from "@shared/contracts/agent"
import { agentApi } from "../api/agentApi"

// 由会话归属上下文推导列表过滤条件。
export const toSessionFilter = (context?: AgentSendContext): AgentSessionFilter | undefined => {
  if (context?.projectItemId) return { projectItemId: context.projectItemId }
  if (context?.page) return { page: context.page }
  return undefined
}

// 历史会话列表（DB 支撑）：列表从 main 拉取，当前会话 id 供面板高亮。
let sessions: AgentSessionSummary[] = []
let currentSessionId: string | null = null
// 标题生成中的会话 id 集合（标题位展示 pulse 占位）。
let pendingSessionIds = new Set<string>()
// 当前会话标题：会话尚未进列表（send 完成前）时先回填，标题生成后立即展示，不等列表刷新。
let currentSessionTitle: string | null = null
const listeners = new Set<() => void>()

const notify = (): void => {
  listeners.forEach((listener) => listener())
}

/**
 * 会话列表存储：替换原内存 chatHistoryStore，列表数据来自 main 进程 DB。
 */
export const sessionListStore = {
  getSessions: (): AgentSessionSummary[] => sessions,

  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  getCurrentSessionId: (): string | null => currentSessionId,

  // 当前标题生成中的会话 id（占位 pulse 判定）。
  getPendingSessionIds: (): Set<string> => pendingSessionIds,

  // 当前会话标题（未入列表会话的生成结果回填；入列表后以列表为准）。
  getCurrentSessionTitle: (): string | null => currentSessionTitle,

  // 标记当前正在查看/编辑的会话（null 表示空白新对话）。
  setCurrentSessionId: (id: string | null): void => {
    if (currentSessionId === id) return
    currentSessionId = id
    currentSessionTitle = null
    notify()
  },

  // 拉取指定归属下的会话列表（item 会话或页面会话）。
  async refresh(filter?: AgentSessionFilter): Promise<void> {
    try {
      sessions = await agentApi.listSessions(filter)
    } catch {
      // IPC 失败：保留上次列表。
    }
    notify()
  },

  // 标题生成开始：标记 pending，标题位展示 pulse 占位。
  setSessionTitlePending(id: string): void {
    pendingSessionIds = new Set(pendingSessionIds).add(id)
    notify()
  },

  // 标题生成结束：清除 pending 并本地同步标题。
  updateSessionTitle(id: string, title: string): void {
    sessions = sessions.map((session) => (session.id === id ? { ...session, title } : session))
    if (id === currentSessionId) currentSessionTitle = title
    if (pendingSessionIds.has(id)) {
      const next = new Set(pendingSessionIds)
      next.delete(id)
      pendingSessionIds = next
    }
    notify()
  },

  // 删除会话后本地移除。
  removeSession(id: string): void {
    sessions = sessions.filter((session) => session.id !== id)
    if (pendingSessionIds.has(id)) {
      const next = new Set(pendingSessionIds)
      next.delete(id)
      pendingSessionIds = next
    }
    notify()
  },
}
