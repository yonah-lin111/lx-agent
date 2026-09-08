import { useSyncExternalStore } from "react"
import { agentTabStore } from "./agentTabStore"
import { sessionListStore } from "./sessionListStore"

export interface FrontDesignItem {
  id: string
  parentId?: string | null
  version?: number
  title: string
  html: string
  updatedAt: number
  isStreaming?: boolean
  sessionId?: string | null
  mode?: "tailwindcss" | "css"
  designDir?: string
}

export interface FrontDesignStoreState {
  designs: FrontDesignItem[]
  activeDesignId: string | null
  title: string
  html: string
  updatedAt: number
  isStreaming: boolean
  sessionId: string | null
  mode?: "tailwindcss" | "css"
  designDir?: string
  parentId?: string | null
  version?: number
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
  const active = internalState.activeDesignId
    ? (internalState.designs.find((d) => d.id === internalState.activeDesignId) ?? null)
    : null
  return {
    designs: internalState.designs,
    activeDesignId: internalState.activeDesignId,
    title: active?.title ?? "",
    html: active?.html ?? "",
    updatedAt: active?.updatedAt ?? 0,
    isStreaming: active?.isStreaming ?? false,
    sessionId: active?.sessionId ?? null,
    mode: active?.mode ?? "tailwindcss",
    designDir: active?.designDir,
    parentId: active?.parentId ?? null,
    version: active?.version ?? 1,
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
    if (!internalState.activeDesignId) return null
    return internalState.designs.find((d) => d.id === internalState.activeDesignId) ?? null
  },

  getDesign: (id: string): FrontDesignItem | null => {
    return internalState.designs.find((d) => d.id === id) ?? null
  },

  getParentDesign: (id: string): FrontDesignItem | null => {
    const current = internalState.designs.find((d) => d.id === id)
    if (!current?.parentId) return null
    return internalState.designs.find((d) => d.id === current.parentId) ?? null
  },

  getDesignVersions: (id: string): FrontDesignItem[] => {
    let current = internalState.designs.find((d) => d.id === id)
    if (!current) return []
    const visited = new Set<string>()
    while (current?.parentId && !visited.has(current.id)) {
      visited.add(current.id)
      const parent = internalState.designs.find((d) => d.id === current?.parentId)
      if (!parent) break
      current = parent
    }
    const rootId = current.id
    const lineageIds = new Set<string>([rootId])
    let added = true
    while (added) {
      added = false
      for (const d of internalState.designs) {
        if (d.parentId && lineageIds.has(d.parentId) && !lineageIds.has(d.id)) {
          lineageIds.add(d.id)
          added = true
        }
      }
    }
    return internalState.designs
      .filter((d) => lineageIds.has(d.id))
      .sort((a, b) => {
        const verDiff = (a.version ?? 1) - (b.version ?? 1)
        if (verDiff !== 0) return verDiff
        return (a.updatedAt ?? 0) - (b.updatedAt ?? 0)
      })
  },

  /**
   * 获取某个设计所属设计族的所有根节点（或无 parentId 的基准设计），
   * 若衍生节点未关联到已知 parentId，则其自身作为独立根节点。
   */
  getRootDesigns: (sessionId?: string | null): FrontDesignItem[] => {
    const sessionDesigns = internalState.designs.filter((d) =>
      sessionId !== undefined ? d.sessionId === sessionId : true,
    )
    return sessionDesigns.filter((d) => {
      if (!d.parentId) return true
      // 如果声明了 parentId 但该 parentId 在当前设计列表中不存在，则自立为根
      return !internalState.designs.some((p) => p.id === d.parentId)
    })
  },

  getAllDesigns: (): FrontDesignItem[] => internalState.designs,

  setActiveDesignId: (id: string | null): void => {
    if (internalState.activeDesignId === id) return
    if (!id) {
      updateState({
        ...internalState,
        activeDesignId: null,
      })
      return
    }
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
    parentId?: string | null
    version?: number
    title?: string
    html: string
    isStreaming?: boolean
    sessionId?: string | null
    autoActivate?: boolean
    updatedAt?: number
    mode?: "tailwindcss" | "css"
    designDir?: string
  }): void => {
    const fallbackSessionId =
      data.sessionId ??
      agentTabStore.getActiveTab()?.sessionId ??
      sessionListStore.getCurrentSessionId() ??
      null

    // 1. 若此前存在未分配 sessionId 的草稿设计项，及时回填当前会话 ID，避免会话过滤时丢失基准设计
    if (fallbackSessionId) {
      for (const d of internalState.designs) {
        if (!d.sessionId) {
          d.sessionId = fallbackSessionId
        }
      }
    }

    const targetTitle = data.title?.trim() || "Frontend Prototype"

    // 2. 智能推断 parentId：
    // 若外部显式传入 parentId 则采用；
    // 若未传入：
    // - 若当前 ID 已存在，保留其原有 parentId（避免将自身设为父级形成环）；
    // - 若当前 ID 不存在（新设计），仅在同会话存在同名设计项时推断为同族衍生。
    let resolvedParentId = data.parentId !== undefined ? data.parentId : null
    const existingIndex = internalState.designs.findIndex((d) => d.id === data.id)
    const existingItem = existingIndex >= 0 ? internalState.designs[existingIndex] : null

    if (resolvedParentId === null || resolvedParentId === undefined) {
      if (existingItem) {
        resolvedParentId = existingItem.parentId ?? null
      } else {
        const sessionDesigns = fallbackSessionId
          ? internalState.designs.filter((d) => d.sessionId === fallbackSessionId || !d.sessionId)
          : internalState.designs

        const activeDesign = internalState.activeDesignId
          ? internalState.designs.find((d) => d.id === internalState.activeDesignId)
          : null

        if (
          activeDesign &&
          activeDesign.id !== data.id &&
          activeDesign.title?.trim().toLowerCase() === targetTitle.toLowerCase()
        ) {
          resolvedParentId = activeDesign.id
        } else {
          const sameTitleCandidate = sessionDesigns
            .filter(
              (d) =>
                d.id !== data.id && d.title?.trim().toLowerCase() === targetTitle.toLowerCase(),
            )
            .sort((a, b) => (b.version ?? 1) - (a.version ?? 1))[0]
          if (sameTitleCandidate) {
            resolvedParentId = sameTitleCandidate.id
          }
        }
      }
    }

    // 3. 检查 ID 冲突与跨轮次流式派生：
    let effectiveId = data.id

    if (existingItem) {
      if (existingItem.isStreaming) {
        // 当前项正在流式更新中，保持同一项就地更新
        effectiveId = existingItem.id
      } else {
        // existingItem 已完成。检查是否已有从其派生的正在流式生成的子项
        const streamingChild = internalState.designs.find(
          (d) =>
            d.isStreaming &&
            (d.parentId === existingItem.id || d.id.startsWith(`${existingItem.id}-v`)),
        )
        if (streamingChild) {
          effectiveId = streamingChild.id
          resolvedParentId = streamingChild.parentId ?? existingItem.id
        } else if (data.isStreaming) {
          // 新一轮流式开始（跨轮次二次修改）：派生新版本 ID，杜绝原地覆盖旧版本
          const family = frontDesignStore.getDesignVersions(existingItem.id)
          const maxVer =
            family.length > 0
              ? Math.max(...family.map((v) => v.version ?? 1))
              : (existingItem.version ?? 1)
          const latestParent = family[family.length - 1] ?? existingItem
          resolvedParentId = latestParent.id
          effectiveId = `${data.id}-v${maxVer + 1}`
        }
      }
    }

    // 防御自引用死循环：effectiveId 严禁等于 resolvedParentId
    if (resolvedParentId && effectiveId === resolvedParentId) {
      const parent = internalState.designs.find((d) => d.id === resolvedParentId)
      const parentVer = parent?.version ?? 1
      effectiveId = `${data.id}-v${parentVer + 1}`
    }

    const finalExistingIndex = internalState.designs.findIndex((d) => d.id === effectiveId)

    // 4. 版本号计算：
    // 若未显式传入数值版本，同一项的流式/局部更新保持原版本；新衍生版本依据当前设计族最大版本自增
    let computedVersion = data.version
    if (typeof computedVersion !== "number") {
      if (
        finalExistingIndex >= 0 &&
        typeof internalState.designs[finalExistingIndex].version === "number"
      ) {
        computedVersion = internalState.designs[finalExistingIndex].version
      } else if (resolvedParentId) {
        const familyVersions = frontDesignStore.getDesignVersions(resolvedParentId)
        if (familyVersions.length > 0) {
          const maxVersion = Math.max(...familyVersions.map((v) => v.version ?? 1))
          computedVersion = maxVersion + 1
        } else {
          const parent = internalState.designs.find((d) => d.id === resolvedParentId)
          computedVersion = (parent?.version ?? 1) + 1
        }
      } else {
        computedVersion =
          finalExistingIndex >= 0 ? (internalState.designs[finalExistingIndex].version ?? 1) : 1
      }
    }

    let nextDesigns: FrontDesignItem[]
    const designTimestamp = data.updatedAt || Date.now()

    if (finalExistingIndex >= 0) {
      const existing = internalState.designs[finalExistingIndex]
      const updated: FrontDesignItem = {
        ...existing,
        id: existing.id,
        parentId: resolvedParentId !== null ? resolvedParentId : (existing.parentId ?? null),
        version: computedVersion,
        title: targetTitle,
        html: data.html,
        updatedAt: existing.updatedAt || designTimestamp,
        isStreaming: data.isStreaming ?? false,
        sessionId: fallbackSessionId ?? existing.sessionId ?? null,
        mode: data.mode ?? existing.mode ?? "tailwindcss",
        designDir: data.designDir ?? existing.designDir,
      }
      nextDesigns = [...internalState.designs]
      nextDesigns[finalExistingIndex] = updated
    } else {
      const newItem: FrontDesignItem = {
        id: effectiveId,
        parentId: resolvedParentId,
        version: computedVersion,
        title: targetTitle,
        html: data.html,
        updatedAt: designTimestamp,
        isStreaming: data.isStreaming ?? false,
        sessionId: fallbackSessionId,
        mode: data.mode ?? "tailwindcss",
        designDir: data.designDir,
      }
      nextDesigns = [newItem, ...internalState.designs]
    }

    const matchedId = effectiveId
    let nextActiveId = internalState.activeDesignId

    // 智能激活与切换联动：
    // 1. 显式指定 autoActivate 时激活目标设计；
    // 2. 首次注册新设计且当前画布为空时激活；
    // 3. 正在流式生成时保持激活当前正在流式的设计
    if (data.autoActivate) {
      nextActiveId = matchedId
      if (fallbackSessionId) {
        const targetTab = agentTabStore.findTabBySessionId(fallbackSessionId)
        if (targetTab && targetTab.id !== agentTabStore.getActiveTabId()) {
          agentTabStore.switchTab(targetTab.id)
        }
      }
    } else if (internalState.activeDesignId === null && finalExistingIndex < 0) {
      nextActiveId = matchedId
    } else if (data.isStreaming) {
      if (internalState.activeDesignId === matchedId) {
        nextActiveId = matchedId
      }
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
