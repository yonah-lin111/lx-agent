import type { AgentSessionSummary } from "@shared/contracts/agent"
import { agentApi } from "../api/agentApi"

export interface SessionBinding {
  projectId?: string
  cwd?: string
}

// 历史会话列表（DB 支撑）：列表从 main 拉取，当前会话 id 供面板高亮。
let sessions: AgentSessionSummary[] = []
let currentSessionId: string | null = null
// 标题生成中的会话 id 集合（标题位展示 pulse 占位）。
let pendingSessionIds = new Set<string>()
// 当前会话标题：会话尚未进列表（send 完成前）时先回填，标题生成后立即展示，不等列表刷新。
let currentSessionTitle: string | null = null
// 缓存当前会话的 SessionBinding 快照对象（保证 useSyncExternalStore 快照引用稳定，避免 React 无限渲染死循环）。
let cachedSessionBinding: SessionBinding | undefined = undefined
// 草稿会话（新会话尚未落库）的绑定信息（用户在状态栏临时切换的项目/工作区）。
let draftBinding: SessionBinding | undefined = undefined

const listeners = new Set<() => void>()

const recomputeBinding = (): void => {
  if (!currentSessionId) {
    cachedSessionBinding = draftBinding
    return
  }
  const session = sessions.find((s) => s.id === currentSessionId)
  if (!session) {
    cachedSessionBinding = undefined
    return
  }
  cachedSessionBinding = {
    projectId: session.projectId ?? undefined,
    cwd: session.cwd,
  }
}

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

  // 当前会话的工具执行目录；新会话尚未落库时返回 draftBinding 或 undefined。
  getCurrentSessionPath: (): string | undefined => cachedSessionBinding?.cwd,

  // 当前会话的绑定信息（项目 ID 与 cwd），新会话尚未落库时返回 draftBinding 或 undefined。
  getCurrentSessionBinding: (): SessionBinding | undefined => cachedSessionBinding,

  // 设置草稿会话绑定（新会话切换项目或工作区）。
  setDraftBinding: (binding: SessionBinding | undefined): void => {
    draftBinding = binding
    if (!currentSessionId) {
      cachedSessionBinding = draftBinding
      notify()
    }
  },

  // 当前标题生成中的会话 id（占位 pulse 判定）。
  getPendingSessionIds: (): Set<string> => pendingSessionIds,

  // 当前会话标题（未入列表会话的生成结果回填；入列表后以列表为准）。
  getCurrentSessionTitle: (): string | null => currentSessionTitle,

  // 标记当前正在查看/编辑的会话（null 表示空白新对话）。
  setCurrentSessionId: (id: string | null): void => {
    if (currentSessionId === id) return
    currentSessionId = id
    currentSessionTitle = null
    draftBinding = undefined
    recomputeBinding()
    notify()
  },

  // 拉取全量会话列表（历史面板客户端过滤）。
  async refresh(): Promise<void> {
    try {
      sessions = await agentApi.listSessions()
    } catch {
      // IPC 失败：保留上次列表。
    }
    recomputeBinding()
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
    recomputeBinding()
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
    recomputeBinding()
    notify()
  },
}
