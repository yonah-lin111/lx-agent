import { create } from "zustand"
import { terminalApi } from "@/features/terminal/api/terminalApi"
import {
  collectAllPaneIds,
  removeNodeAt,
  splitNodeAt,
  updateSplitRatioAt,
} from "@/features/terminal/splitTreeUtils"
import { disposeTerminalSession } from "@/features/terminal/terminalSessionRegistry"
import type { SplitDirection, TerminalPaneItem, TerminalTabItem } from "@/features/terminal/types"
import { resolveCwdDisplayName } from "@/features/terminal/utils"

// 终端状态存储接口。
interface TerminalStoreState {
  tabs: TerminalTabItem[]
  activeTabId: string | null
  terminalCounter: number
  addTab: (params?: { cwd?: string; projectId?: string; itemId?: string; title?: string }) => string
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabTitle: (id: string, title: string) => void
  updatePaneTitle: (paneId: string, title: string) => void
  splitPane: (tabId: string, direction: SplitDirection, cwd?: string) => string | null
  removePane: (tabId: string, paneId: string) => void
  setActivePane: (tabId: string, paneId: string) => void
  setSplitRatio: (tabId: string, containerId: string, ratio: number) => void
  clearTabs: () => void
}

/**
 * 终端标签与二叉分屏状态全局 Store。
 */
export const useTerminalStore = create<TerminalStoreState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  terminalCounter: 1,

  addTab: (params) => {
    const nextCounter = get().terminalCounter + 1
    const tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const paneId = `pane_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const defaultTitle = `Terminal ${get().terminalCounter}`

    const initialPane: TerminalPaneItem = {
      id: paneId,
      title: params?.title?.trim() || defaultTitle,
      cwd: params?.cwd,
      projectId: params?.projectId,
      itemId: params?.itemId,
      createdAt: Date.now(),
    }

    const newTab: TerminalTabItem = {
      id: tabId,
      title: params?.title?.trim() || defaultTitle,
      panes: { [paneId]: initialPane },
      rootNode: { type: "leaf", paneId },
      activePaneId: paneId,
      cwd: params?.cwd,
      projectId: params?.projectId,
      itemId: params?.itemId,
      createdAt: Date.now(),
    }

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: tabId,
      terminalCounter: nextCounter,
    }))

    return tabId
  },

  removeTab: (tabId: string) => {
    const targetTab = get().tabs.find((t) => t.id === tabId)
    if (targetTab) {
      for (const paneId of Object.keys(targetTab.panes)) {
        disposeTerminalSession(paneId)
        void terminalApi.kill(paneId)
      }
    }

    set((state) => {
      const targetIndex = state.tabs.findIndex((tab) => tab.id === tabId)
      if (targetIndex === -1) return state

      const nextTabs = state.tabs.filter((tab) => tab.id !== tabId)
      let nextActiveId = state.activeTabId

      if (state.activeTabId === tabId) {
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

    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== id) return tab
        if (!trimmed) {
          const activePaneTitle = tab.panes[tab.activePaneId]?.title
          return {
            ...tab,
            customTitle: undefined,
            title: activePaneTitle || tab.title,
          }
        }
        return {
          ...tab,
          title: trimmed,
          customTitle: trimmed,
        }
      }),
    }))
  },

  updatePaneTitle: (paneId: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return

    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (!tab.panes[paneId]) return tab

        const nextPanes = {
          ...tab.panes,
          [paneId]: {
            ...tab.panes[paneId],
            title: trimmed,
          },
        }

        const isCurrentActive = tab.activePaneId === paneId
        const nextTitle = !tab.customTitle && isCurrentActive ? trimmed : tab.title

        return {
          ...tab,
          panes: nextPanes,
          title: nextTitle,
        }
      }),
    }))
  },

  splitPane: (tabId, direction, cwd) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return null

    const existingPaneIds = collectAllPaneIds(tab.rootNode)
    // 最大限制单 Tab 8 个嵌套分屏，保持性能与可用性
    if (existingPaneIds.length >= 8) return null

    const targetPaneId = tab.activePaneId || existingPaneIds[0]
    if (!targetPaneId) return null

    const newPaneId = `pane_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const activePane = tab.panes[targetPaneId]
    const effectiveCwd = cwd || activePane?.cwd || tab.cwd

    const newPaneTitle = resolveCwdDisplayName(effectiveCwd)

    const newPane: TerminalPaneItem = {
      id: newPaneId,
      title: newPaneTitle,
      cwd: effectiveCwd,
      projectId: tab.projectId,
      itemId: tab.itemId,
      createdAt: Date.now(),
    }

    const nextRootNode = splitNodeAt(tab.rootNode, targetPaneId, newPaneId, direction)

    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t
        const nextTitle = !t.customTitle && newPaneTitle ? newPaneTitle : t.title
        return {
          ...t,
          panes: { ...t.panes, [newPaneId]: newPane },
          rootNode: nextRootNode,
          activePaneId: newPaneId,
          title: nextTitle,
        }
      }),
    }))

    return newPaneId
  },

  removePane: (tabId, paneId) => {
    disposeTerminalSession(paneId)
    void terminalApi.kill(paneId)

    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return

    const nextRootNode = removeNodeAt(tab.rootNode, paneId)

    // 若整棵树已被清空，则销毁整个 Tab
    if (!nextRootNode) {
      get().removeTab(tabId)
      return
    }

    const remainingPaneIds = collectAllPaneIds(nextRootNode)
    const nextPanes = { ...tab.panes }
    delete nextPanes[paneId]

    const nextActivePaneId =
      tab.activePaneId === paneId ? remainingPaneIds[0] || "" : tab.activePaneId

    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t
        const activePaneTitle = nextPanes[nextActivePaneId]?.title
        const nextTitle = !t.customTitle && activePaneTitle ? activePaneTitle : t.title

        return {
          ...t,
          panes: nextPanes,
          rootNode: nextRootNode,
          activePaneId: nextActivePaneId,
          title: nextTitle,
        }
      }),
    }))
  },

  setActivePane: (tabId, paneId) => {
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t
        const activePaneTitle = t.panes[paneId]?.title
        const nextTitle = !t.customTitle && activePaneTitle ? activePaneTitle : t.title
        return {
          ...t,
          activePaneId: paneId,
          title: nextTitle,
        }
      }),
    }))
  },

  setSplitRatio: (tabId, containerId, ratio) => {
    const clampedRatio = Math.max(0.05, Math.min(0.95, ratio))
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              rootNode: updateSplitRatioAt(t.rootNode, containerId, clampedRatio),
            }
          : t,
      ),
    }))
  },

  clearTabs: () => {
    const { tabs } = get()
    for (const tab of tabs) {
      for (const paneId of Object.keys(tab.panes)) {
        void terminalApi.kill(paneId)
      }
    }
    set({ tabs: [], activeTabId: null })
  },
}))
