// 右侧栏折叠状态：layout 写入，其他区域（如 Markdown 编辑器）只读感知。
let isRightSidebarCollapsed = true
const listeners = new Set<() => void>()

const notify = (): void => {
  listeners.forEach((listener) => listener())
}

/**
 * 右侧栏状态存储：供 layout 与页面组件共享展开/折叠状态。
 */
export const rightSidebarStore = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  isCollapsed: (): boolean => isRightSidebarCollapsed,

  setCollapsed: (collapsed: boolean): void => {
    if (isRightSidebarCollapsed === collapsed) return
    isRightSidebarCollapsed = collapsed
    notify()
  },
}
