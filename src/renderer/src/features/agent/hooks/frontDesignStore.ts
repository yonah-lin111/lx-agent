import { useSyncExternalStore } from "react"
import { agentTabStore } from "./agentTabStore"
import { sessionListStore } from "./sessionListStore"

export interface FrontDesignItem {
  id: string
  title: string
  html: string
  updatedAt: number
  isStreaming?: boolean
  sessionId?: string | null
}

export interface FrontDesignStoreState {
  designs: FrontDesignItem[]
  activeDesignId: string | null
  title: string
  html: string
  updatedAt: number
  isStreaming: boolean
  sessionId: string | null
}

export type FrontDesignState = FrontDesignStoreState

const STORAGE_KEY = "lx-agent-front-design-state-v2"
const LEGACY_STORAGE_KEY = "lx-agent-front-design-state"

// 彻底清除旧版浏览器缓存，避免残留重复和历史数据污染
try {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(LEGACY_STORAGE_KEY)
} catch {
  // ignore
}

interface InternalState {
  designs: FrontDesignItem[]
  activeDesignId: string | null
}

let internalState: InternalState = {
  designs: [],
  activeDesignId: null,
}
const listeners = new Set<() => void>()

const notify = (): void => {
  listeners.forEach((listener) => listener())
}

const computePublicState = (): FrontDesignStoreState => {
  const active =
    internalState.designs.find((d) => d.id === internalState.activeDesignId) ??
    internalState.designs[0] ??
    null
  return {
    designs: internalState.designs,
    activeDesignId: internalState.activeDesignId ?? active?.id ?? null,
    title: active?.title ?? "",
    html: active?.html ?? "",
    updatedAt: active?.updatedAt ?? 0,
    isStreaming: active?.isStreaming ?? false,
    sessionId: active?.sessionId ?? null,
  }
}

let cachedPublicState: FrontDesignStoreState = computePublicState()

const updateState = (next: InternalState): void => {
  internalState = next
  cachedPublicState = computePublicState()
  notify()
}

/**
 * 前端设计看板响应式存储：支持多历史设计切换与实时热更新。
 */
export const frontDesignStore = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  getState: (): FrontDesignStoreState => cachedPublicState,

  getActiveDesign: (): FrontDesignItem | null => {
    if (!internalState.designs.length) return null
    return (
      internalState.designs.find((d) => d.id === internalState.activeDesignId) ??
      internalState.designs[0] ??
      null
    )
  },

  getAllDesigns: (): FrontDesignItem[] => internalState.designs,

  setActiveDesignId: (id: string): void => {
    if (internalState.activeDesignId === id) return
    const exists = internalState.designs.some((d) => d.id === id)
    if (exists) {
      updateState({
        ...internalState,
        activeDesignId: id,
      })
    }
  },

  registerDesign: (data: {
    id: string
    title?: string
    html: string
    isStreaming?: boolean
    sessionId?: string | null
    autoActivate?: boolean
  }): void => {
    const fallbackSessionId =
      data.sessionId ??
      agentTabStore.getActiveTab()?.sessionId ??
      sessionListStore.getCurrentSessionId() ??
      null

    // 精确多维去重查找：
    // 1. 同一个 id；
    // 2. 或同一个 sessionId 下存在同名 title 的设计项；
    const targetTitle = data.title?.trim() || "Frontend Prototype"
    const existingIndex = internalState.designs.findIndex(
      (d) =>
        d.id === data.id ||
        (fallbackSessionId && d.sessionId === fallbackSessionId && d.title?.trim() === targetTitle),
    )

    let nextDesigns: FrontDesignItem[]
    const now = Date.now()

    if (existingIndex >= 0) {
      const existing = internalState.designs[existingIndex]
      const updated: FrontDesignItem = {
        ...existing,
        id: existing.id, // 沿用原有稳定 ID，避免产生重复 item
        title: targetTitle,
        html: data.html,
        updatedAt: now,
        isStreaming: data.isStreaming ?? false,
        sessionId: fallbackSessionId ?? existing.sessionId ?? null,
      }
      nextDesigns = [...internalState.designs]
      nextDesigns[existingIndex] = updated
    } else {
      const newItem: FrontDesignItem = {
        id: data.id,
        title: targetTitle,
        html: data.html,
        updatedAt: now,
        isStreaming: data.isStreaming ?? false,
        sessionId: fallbackSessionId,
      }
      // 最新生成的排在前面
      nextDesigns = [newItem, ...internalState.designs]
    }

    const matchedId = existingIndex >= 0 ? internalState.designs[existingIndex].id : data.id
    let nextActiveId = internalState.activeDesignId
    if (data.autoActivate || data.isStreaming) {
      nextActiveId = matchedId
    }

    updateState({
      designs: nextDesigns,
      activeDesignId: nextActiveId,
    })
  },

  // 兼容老方法 setDesign
  setDesign: (data: {
    title?: string
    html: string
    isStreaming?: boolean
    sessionId?: string | null
    id?: string
  }): void => {
    const id = data.id || "design-default"
    frontDesignStore.registerDesign({
      ...data,
      id,
      autoActivate: true,
    })
  },

  removeDesign: (id: string): void => {
    const nextDesigns = internalState.designs.filter((d) => d.id !== id)
    let nextActiveId = internalState.activeDesignId
    if (nextActiveId === id) {
      nextActiveId = nextDesigns[0]?.id ?? null
    }
    updateState({
      designs: nextDesigns,
      activeDesignId: nextActiveId,
    })
  },

  clear: (): void => {
    updateState({
      designs: [],
      activeDesignId: null,
    })
  },
}

/**
 * 响应式 Hook：订阅当前激活的前端设计对象及状态。
 */
export const useFrontDesign = (): FrontDesignStoreState => {
  return useSyncExternalStore(frontDesignStore.subscribe, frontDesignStore.getState)
}
