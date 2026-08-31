export interface AgentTabDraftBinding {
  projectId?: string
  cwd?: string
}

export interface AgentTab {
  id: string
  sessionId: string | null
  title?: string
  draftBinding?: AgentTabDraftBinding
  createdAt: number
}

const MAX_TABS = 8

const createDefaultTab = (): AgentTab => ({
  id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  sessionId: null,
  createdAt: Date.now(),
})

// 清理旧版可能遗留的 localStorage 数据
try {
  localStorage.removeItem("lx-agent:tabs:state")
} catch {
  // ignore
}

const initialDefaultTab = createDefaultTab()
let tabs: AgentTab[] = [initialDefaultTab]
let activeTabId: string = initialDefaultTab.id
let streamingMap: Record<string, boolean> = {}
const listeners = new Set<() => void>()

const notify = (): void => {
  listeners.forEach((listener) => listener())
}

/**
 * Agent 标签页状态存储：管理多 AgentPage 标签页列表、激活状态及 1:1 会话映射互斥。
 */
export const agentTabStore = {
  getTabs: (): AgentTab[] => tabs,

  getActiveTabId: (): string => activeTabId,

  getActiveTab: (): AgentTab | undefined => tabs.find((t) => t.id === activeTabId),

  getStreamingMap: (): Record<string, boolean> => streamingMap,

  isTabStreaming: (tabId: string): boolean => Boolean(streamingMap[tabId]),

  setTabStreaming: (tabId: string, isStreaming: boolean): void => {
    if (Boolean(streamingMap[tabId]) === isStreaming) return
    if (isStreaming) {
      streamingMap = { ...streamingMap, [tabId]: true }
    } else {
      const next = { ...streamingMap }
      delete next[tabId]
      streamingMap = next
    }
    notify()
  },

  /**
   * 检查指定 sessionId 是否已在某个 Tab 中打开。
   */
  findTabBySessionId: (sessionId: string): AgentTab | undefined => {
    return tabs.find((t) => t.sessionId === sessionId)
  },

  /**
   * 创建新 Tab。
   * 若 initialSessionId 已被其他 Tab 打开，则直接切换到该 Tab 并返回其 ID；
   * 若 Tab 数量已达上限（8个），返回 null。
   */
  createTab: (
    initialSessionId?: string | null,
    draftBinding?: AgentTabDraftBinding,
  ): string | null => {
    if (initialSessionId) {
      const existing = tabs.find((t) => t.sessionId === initialSessionId)
      if (existing) {
        agentTabStore.switchTab(existing.id)
        return existing.id
      }
    }

    if (tabs.length >= MAX_TABS) {
      return null
    }

    const newTab: AgentTab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId: initialSessionId ?? null,
      draftBinding,
      createdAt: Date.now(),
    }

    tabs = [...tabs, newTab]
    activeTabId = newTab.id
    notify()
    return newTab.id
  },

  /**
   * 关闭 Tab。至少保留 1 个 Tab。
   */
  closeTab: (tabId: string): boolean => {
    if (tabs.length <= 1) return false
    const index = tabs.findIndex((t) => t.id === tabId)
    if (index === -1) return false

    const nextTabs = tabs.filter((t) => t.id !== tabId)
    let nextActiveId = activeTabId
    if (activeTabId === tabId) {
      const fallbackTab = nextTabs[Math.max(0, index - 1)] ?? nextTabs[0]
      nextActiveId = fallbackTab.id
    }

    tabs = nextTabs
    activeTabId = nextActiveId
    if (streamingMap[tabId]) {
      const nextStreaming = { ...streamingMap }
      delete nextStreaming[tabId]
      streamingMap = nextStreaming
    }
    notify()
    return true
  },

  /**
   * 切换激活 Tab。
   */
  switchTab: (tabId: string): void => {
    if (activeTabId === tabId) return
    const exists = tabs.some((t) => t.id === tabId)
    if (!exists) return
    activeTabId = tabId
    notify()
  },

  /**
   * 更新指定 Tab 绑定的 sessionId。
   */
  setTabSessionId: (tabId: string, sessionId: string | null): void => {
    tabs = tabs.map((t) => (t.id === tabId ? { ...t, sessionId } : t))
    notify()
  },

  /**
   * 更新指定 Tab 的标题。
   */
  setTabTitle: (tabId: string, title: string): void => {
    tabs = tabs.map((t) => (t.id === tabId ? { ...t, title } : t))
    notify()
  },

  /**
   * 更新指定 Tab 的草稿绑定信息。
   */
  setTabDraftBinding: (tabId: string, draftBinding: AgentTabDraftBinding | undefined): void => {
    tabs = tabs.map((t) => (t.id === tabId ? { ...t, draftBinding } : t))
    notify()
  },

  /**
   * 订阅状态变更。
   */
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
