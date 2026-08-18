import { create } from "zustand"
import { terminalApi } from "@/features/terminal/api/terminalApi"
import type { TerminalTabItem } from "@/features/terminal/types"

// 终端状态存储接口。
interface TerminalStoreState {
  tabs: TerminalTabItem[]
  activeTabId: string | null
  terminalCounter: number
  addTab: (params?: { cwd?: string; projectId?: string; itemId?: string; title?: string }) => string
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabTitle: (id: string, title: string) => void
  clearTabs: () => void
}

/**
 * 终端标签与活动状态全局 Store。
 */
export const useTerminalStore = create<TerminalStoreState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  terminalCounter: 1,

  addTab: (params) => {
    const nextCounter = get().terminalCounter + 1
    const id = `term_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const defaultTitle = `终端 ${get().terminalCounter}`

    const newTab: TerminalTabItem = {
      id,
      title: params?.title?.trim() || defaultTitle,
      cwd: params?.cwd,
      projectId: params?.projectId,
      itemId: params?.itemId,
      createdAt: Date.now(),
    }

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: id,
      terminalCounter: nextCounter,
    }))

    return id
  },

  removeTab: (id: string) => {
    void terminalApi.kill(id)

    set((state) => {
      const targetIndex = state.tabs.findIndex((tab) => tab.id === id)
      if (targetIndex === -1) return state

      const nextTabs = state.tabs.filter((tab) => tab.id !== id)
      let nextActiveId = state.activeTabId

      if (state.activeTabId === id) {
        if (nextTabs.length === 0) {
          nextActiveId = null
        } else if (targetIndex > 0) {
          nextActiveId = nextTabs[targetIndex - 1]?.id ?? null
        } else {
          nextActiveId = nextTabs[0]?.id ?? null
        }
      }

      return {
        tabs: nextTabs,
        activeTabId: nextActiveId,
      }
    })
  },

  setActiveTab: (id: string) => {
    set({ activeTabId: id })
  },

  updateTabTitle: (id: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return

    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, title: trimmed, customTitle: trimmed } : tab,
      ),
    }))
  },

  clearTabs: () => {
    const { tabs } = get()
    for (const tab of tabs) {
      void terminalApi.kill(tab.id)
    }
    set({ tabs: [], activeTabId: null })
  },
}))
