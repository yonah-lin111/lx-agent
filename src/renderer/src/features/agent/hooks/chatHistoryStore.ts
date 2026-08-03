import { MOCK_CHAT_SESSIONS } from "../constants"
import type { AgentMessage, ChatSession } from "../types"

// 历史会话最多保留条数。
const MAX_SESSIONS = 50

let sessions: ChatSession[] = [...MOCK_CHAT_SESSIONS]
let currentSessionId: string | null = null
const listeners = new Set<() => void>()

const notify = (): void => {
  listeners.forEach((listener) => listener())
}

// 从消息中提取会话标题（取首条用户消息，压缩空白并截断）。
const createTitle = (messages: AgentMessage[]): string => {
  const firstUser = messages.find((message) => message.role === "user")
  return (firstUser?.content ?? "新对话").replace(/\s+/g, " ").trim().slice(0, 40)
}

// 按消息 id 序列判断 prefix 是否为 full 的前缀（是否为同一对话的延续）。
const isPrefixOf = (prefix: AgentMessage[], full: AgentMessage[]): boolean =>
  prefix.length <= full.length && prefix.every((message, index) => message.id === full[index]?.id)

/**
 * 内存级会话历史存储（模块级共享，跨 AgentPage 实例存活，重启即失）。
 */
export const chatHistoryStore = {
  getSessions: (): ChatSession[] => sessions,

  getSession: (id: string): ChatSession | undefined =>
    sessions.find((session) => session.id === id),

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

  // 保存当前对话：最新会话为同一对话的延续时原地更新，否则插入新会话。
  saveSession: (messages: AgentMessage[]): void => {
    if (messages.length === 0) return
    const latest = sessions[0]
    if (latest && isPrefixOf(latest.messages, messages)) {
      sessions = [{ ...latest, messages }, ...sessions.slice(1)]
    } else {
      sessions = [
        { id: `chat-${Date.now()}`, title: createTitle(messages), createdAt: Date.now(), messages },
        ...sessions,
      ]
    }
    if (sessions.length > MAX_SESSIONS) sessions = sessions.slice(0, MAX_SESSIONS)
    notify()
  },

  // 将会话置顶（恢复后继续对话时，卸载保存可原地更新该会话而不产生重复）。
  touch: (id: string): void => {
    const index = sessions.findIndex((session) => session.id === id)
    if (index <= 0) return
    sessions = [sessions[index], ...sessions.slice(0, index), ...sessions.slice(index + 1)]
    notify()
  },
}
