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

  // 标记当前正在查看/编辑的会话（null 表示空白新对话）。
  setCurrentSessionId: (id: string | null): void => {
    if (currentSessionId === id) return
    currentSessionId = id
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

  // 重命名后本地同步标题。
  updateSessionTitle(id: string, title: string): void {
    sessions = sessions.map((session) => (session.id === id ? { ...session, title } : session))
    notify()
  },

  // 删除会话后本地移除。
  removeSession(id: string): void {
    sessions = sessions.filter((session) => session.id !== id)
    notify()
  },
}
