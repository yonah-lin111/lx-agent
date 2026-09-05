import { useSyncExternalStore } from "react"

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

interface InternalState {
  designs: FrontDesignItem[]
  activeDesignId: string | null
}

const getInitialInternalState = (): InternalState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as InternalState
      if (Array.isArray(parsed.designs)) {
        return {
          designs: parsed.designs,
          activeDesignId: parsed.activeDesignId ?? (parsed.designs[0]?.id ?? null),
        }
      }
    }
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw)
      if (typeof legacyParsed.html === "string" && legacyParsed.html) {
        const item: FrontDesignItem = {
          id: "legacy-design-1",
          title: legacyParsed.title || "Frontend Prototype",
          html: legacyParsed.html,
          updatedAt: legacyParsed.updatedAt || Date.now(),
          isStreaming: false,
          sessionId: legacyParsed.sessionId ?? null,
        }
        return {
          designs: [item],
          activeDesignId: item.id,
        }
      }
    }
  } catch {
    // 忽略解析失败
  }
  return {
    designs: [],
    activeDesignId: null,
  }
}

let internalState: InternalState = getInitialInternalState()
const listeners = new Set<() => void>()

const notify = (): void => {
  listeners.forEach((listener) => listener())
}

const persist = (): void => {
  try {
    const toSave: InternalState = {
      designs: internalState.designs.map((d) => ({ ...d, isStreaming: false })),
      activeDesignId: internalState.activeDesignId,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch {
    // 忽略写入失败
  }
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
      persist()
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
    const existingIndex = internalState.designs.findIndex((d) => d.id === data.id)
    let nextDesigns: FrontDesignItem[]
    const now = Date.now()

    if (existingIndex >= 0) {
      const existing = internalState.designs[existingIndex]
      const updated: FrontDesignItem = {
        ...existing,
        title: data.title ?? existing.title,
        html: data.html,
        updatedAt: now,
        isStreaming: data.isStreaming ?? false,
        sessionId: data.sessionId ?? existing.sessionId,
      }
      nextDesigns = [...internalState.designs]
      nextDesigns[existingIndex] = updated
    } else {
      const newItem: FrontDesignItem = {
        id: data.id,
        title: data.title ?? "Frontend Prototype",
        html: data.html,
        updatedAt: now,
        isStreaming: data.isStreaming ?? false,
        sessionId: data.sessionId ?? null,
      }
      // 最新生成的排在前面
      nextDesigns = [newItem, ...internalState.designs]
    }

    let nextActiveId = internalState.activeDesignId
    if (data.autoActivate) {
      nextActiveId = data.id
    } else if (data.isStreaming) {
      nextActiveId = data.id
    }

    updateState({
      designs: nextDesigns,
      activeDesignId: nextActiveId,
    })

    if (!data.isStreaming) {
      persist()
    }
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
    persist()
  },

  clear: (): void => {
    updateState({
      designs: [],
      activeDesignId: null,
    })
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // 忽略
    }
  },
}

/**
 * 响应式 Hook：订阅当前激活的前端设计对象及状态。
 */
export const useFrontDesign = (): FrontDesignStoreState => {
  return useSyncExternalStore(frontDesignStore.subscribe, frontDesignStore.getState)
}
