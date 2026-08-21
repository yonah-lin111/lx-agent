export type AgentViewMode = "qa" | "flow"

const STORAGE_KEY = "lx-agent-view-mode"

// 从 localStorage 读取持久化的视图模式，缺省为 "qa"。
const getInitialMode = (): AgentViewMode => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "flow" || saved === "qa") {
      return saved
    }
  } catch {
    // 忽略异常
  }
  return "qa"
}

let currentViewMode: AgentViewMode = getInitialMode()
let isGenerating = false
const listeners = new Set<() => void>()

const notify = (): void => {
  listeners.forEach((listener) => listener())
}

/**
 * Agent 视图模式存储：管理 QA（问答列表）与 Flow（执行流程）模式的切换与持久化。
 */
export const agentViewStore = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  getViewMode: (): AgentViewMode => currentViewMode,

  // 尝试切换视图模式：若正在生成中则拒绝切换并返回 false；成功切换并持久化返回 true。
  setViewMode: (mode: AgentViewMode): boolean => {
    if (isGenerating) {
      return false
    }
    if (currentViewMode === mode) return true
    currentViewMode = mode
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // 忽略存储失败
    }
    notify()
    return true
  },

  // 切换 QA / Flow 模式
  toggleViewMode: (): boolean => {
    const nextMode: AgentViewMode = currentViewMode === "flow" ? "qa" : "flow"
    return agentViewStore.setViewMode(nextMode)
  },

  // 同步生成状态
  setIsGenerating: (generating: boolean): void => {
    if (isGenerating === generating) return
    isGenerating = generating
    notify()
  },

  isGenerating: (): boolean => isGenerating,
}
