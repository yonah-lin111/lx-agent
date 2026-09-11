import type {
  OpenClawChatMessage,
  OpenClawSessionEvent,
  OpenClawSessionSnapshot,
} from "@shared/contracts/openclaw"
import { create } from "zustand"
import { openclawApi } from "./api/openclawApi"

// 会话在 store 中的复合键（\u0000 不会出现在实例 id 或 Agent id 中）。
export const openClawSessionKey = (instanceId: string, agentId: string): string =>
  `${instanceId}\u0000${agentId}`

// 按 id upsert 一条消息，保持原位置。
const upsertMessage = (
  messages: OpenClawChatMessage[],
  next: OpenClawChatMessage,
): OpenClawChatMessage[] => {
  const index = messages.findIndex((message) => message.id === next.id)
  if (index === -1) return [...messages, next]
  const updated = [...messages]
  updated[index] = next
  return updated
}

interface OpenClawChatState {
  sessions: Record<string, OpenClawSessionSnapshot>
  getSession: (instanceId: string, agentId: string) => OpenClawSessionSnapshot | undefined
  connect: (instanceId: string) => Promise<void>
  loadSession: (instanceId: string, agentId: string) => Promise<void>
  sendMessage: (instanceId: string, agentId: string, message: string) => Promise<void>
  abort: (instanceId: string, agentId: string) => Promise<void>
  createSession: (instanceId: string, agentId: string) => Promise<void>
  applyEvent: (event: OpenClawSessionEvent) => void
  clear: (instanceId: string, agentId: string) => void
}

/**
 * OpenClaw 聊天会话在渲染进程的投影缓存。
 *
 * 主进程为权威源：此处只缓存快照并按事件增量更新，挂载/重连时以主进程快照覆盖。
 */
export const useOpenClawChatStore = create<OpenClawChatState>((set, get) => ({
  sessions: {},

  getSession: (instanceId, agentId) => get().sessions[openClawSessionKey(instanceId, agentId)],

  connect: async (instanceId) => {
    await openclawApi.connect(instanceId)
    // 连接结果（connected / error / pairing-required）以主进程快照为准，
    // 刷新该实例下已加载会话（或已存在 targets）的权威状态。
    const targets = new Set(
      Object.values(get().sessions)
        .filter((snapshot) => snapshot.instanceId === instanceId)
        .map((snapshot) => snapshot.agentId),
    )
    for (const agentId of targets) {
      const snapshot = await openclawApi.getSnapshot(instanceId, agentId)
      set((state) => ({
        sessions: { ...state.sessions, [openClawSessionKey(instanceId, agentId)]: snapshot },
      }))
    }
  },

  loadSession: async (instanceId, agentId) => {
    const snapshot = await openclawApi.getSnapshot(instanceId, agentId)
    set((state) => ({
      sessions: { ...state.sessions, [openClawSessionKey(instanceId, agentId)]: snapshot },
    }))
  },

  sendMessage: async (instanceId, agentId, message) => {
    await openclawApi.sendMessage({ instanceId, agentId, message })
  },

  abort: async (instanceId, agentId) => {
    await openclawApi.abort(instanceId, agentId)
  },

  createSession: async (instanceId, agentId) => {
    await openclawApi.createSession(instanceId, agentId)
    await get().loadSession(instanceId, agentId)
  },

  applyEvent: (event) => {
    const key = openClawSessionKey(event.instanceId, event.agentId)
    set((state) => {
      if (event.kind === "snapshot") {
        return { sessions: { ...state.sessions, [key]: event.snapshot } }
      }

      const current = state.sessions[key]
      if (!current) return state
      return {
        sessions: {
          ...state.sessions,
          [key]: { ...current, messages: upsertMessage(current.messages, event.message) },
        },
      }
    })
  },

  clear: (instanceId, agentId) => {
    const key = openClawSessionKey(instanceId, agentId)
    set((state) => {
      if (!(key in state.sessions)) return state
      const sessions = { ...state.sessions }
      delete sessions[key]
      return { sessions }
    })
  },
}))

// 主进程会话事件的全局订阅（幂等）。
let eventUnsubscribe: (() => void) | null = null

/**
 * 订阅主进程推送的会话事件，写入投影缓存。重复调用只建立一次订阅。
 */
export const ensureOpenClawEventSubscription = (): void => {
  if (eventUnsubscribe) return
  eventUnsubscribe = openclawApi.onEvent((event) => {
    useOpenClawChatStore.getState().applyEvent(event)
  })
}
