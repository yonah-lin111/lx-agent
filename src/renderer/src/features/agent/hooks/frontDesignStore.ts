import { useSyncExternalStore } from "react"

export interface FrontDesignState {
  title: string
  html: string
  updatedAt: number
  isStreaming: boolean
  sessionId: string | null
}

const STORAGE_KEY = "lx-agent-front-design-state"

const getInitialState = (): FrontDesignState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as FrontDesignState
      if (typeof parsed.html === "string") {
        return {
          title: parsed.title || "Frontend Prototype",
          html: parsed.html,
          updatedAt: parsed.updatedAt || Date.now(),
          isStreaming: false,
          sessionId: parsed.sessionId ?? null,
        }
      }
    }
  } catch {
    // 忽略解析失败
  }
  return {
    title: "",
    html: "",
    updatedAt: 0,
    isStreaming: false,
    sessionId: null,
  }
}

let currentState: FrontDesignState = getInitialState()
const listeners = new Set<() => void>()

const notify = (): void => {
  listeners.forEach((listener) => listener())
}

/**
 * 前端设计看板响应式存储：管理当前最新接收的 HTML 原型代码及元数据。
 */
export const frontDesignStore = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  getState: (): FrontDesignState => currentState,

  setDesign: (data: {
    title?: string
    html: string
    isStreaming?: boolean
    sessionId?: string | null
  }): void => {
    currentState = {
      title: data.title ?? currentState.title ?? "Frontend Prototype",
      html: data.html,
      updatedAt: Date.now(),
      isStreaming: data.isStreaming ?? false,
      sessionId: data.sessionId ?? currentState.sessionId,
    }

    // 仅在非流式状态持久化到 localStorage，降低 IO
    if (!data.isStreaming && data.html) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState))
      } catch {
        // 忽略写入失败
      }
    }

    notify()
  },

  clear: (): void => {
    currentState = {
      title: "",
      html: "",
      updatedAt: 0,
      isStreaming: false,
      sessionId: null,
    }
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // 忽略
    }
    notify()
  },
}

/**
 * 响应式 Hook：订阅 frontDesignStore 的实时变更。
 */
export const useFrontDesign = (): FrontDesignState => {
  return useSyncExternalStore(frontDesignStore.subscribe, frontDesignStore.getState)
}
