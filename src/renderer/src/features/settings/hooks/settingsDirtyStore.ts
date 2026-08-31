import { useSyncExternalStore } from "react"

// 记录各分区（section）是否存在未保存的脏数据
let dirtyState: Record<string, boolean> = {}
const listeners = new Set<() => void>()

// 注册各分区的全局保存动作（当在顶部栏点击保存时，按需触发）
const saveHandlers: Record<string, () => Promise<void>> = {}
// 注册各分区的全局重置动作（当在顶部栏点击重置时触发）
const resetHandlers: Record<string, () => void> = {}

// 全局清空所有分区的草稿与内存修改缓存的回调列表（在组件未挂载时也能直接清空模块缓存）
const clearCacheHandlers: Array<() => void> = []

export const settingsDirtyStore = {
  getDirtyState: (): Record<string, boolean> => dirtyState,

  isSectionDirty: (sectionId: string): boolean => Boolean(dirtyState[sectionId]),

  hasAnyDirty: (): boolean => Object.values(dirtyState).some(Boolean),

  setSectionDirty: (sectionId: string, isDirty: boolean): void => {
    if (dirtyState[sectionId] === isDirty) return
    dirtyState = { ...dirtyState, [sectionId]: isDirty }
    listeners.forEach((fn) => fn())
  },

  registerSaveHandler: (sectionId: string, handler: () => Promise<void>): (() => void) => {
    saveHandlers[sectionId] = handler
    return () => {
      delete saveHandlers[sectionId]
    }
  },

  registerResetHandler: (sectionId: string, handler: () => void): (() => void) => {
    resetHandlers[sectionId] = handler
    return () => {
      delete resetHandlers[sectionId]
    }
  },

  registerClearCacheHandler: (handler: () => void): (() => void) => {
    clearCacheHandlers.push(handler)
    return () => {
      const idx = clearCacheHandlers.indexOf(handler)
      if (idx !== -1) clearCacheHandlers.splice(idx, 1)
    }
  },

  saveSection: async (sectionId: string): Promise<void> => {
    if (saveHandlers[sectionId]) {
      await saveHandlers[sectionId]()
    }
  },

  resetAllSections: (): void => {
    // 1. 先调用所有缓存清除函数（清空模块级 draftStore / modifiedStore 等）
    clearCacheHandlers.forEach((fn) => {
      try {
        fn()
      } catch (err) {
        console.warn("[settingsDirtyStore] Failed to clear cache:", err)
      }
    })

    // 2. 调用当前已挂载组件注册的 reset 处理函数
    Object.values(resetHandlers).forEach((handler) => {
      try {
        handler()
      } catch (err) {
        console.warn("[settingsDirtyStore] Failed to reset section:", err)
      }
    })

    // 3. 重置所有分区的 dirtyState
    dirtyState = {}
    listeners.forEach((fn) => fn())
  },

  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export const useSettingsDirtyState = (): Record<string, boolean> => {
  return useSyncExternalStore(settingsDirtyStore.subscribe, settingsDirtyStore.getDirtyState)
}
