import { Terminal as TerminalIcon } from "lucide-react"
import { useCallback, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { TerminalSplitView } from "@/features/terminal/components/TerminalSplitView"
import { TerminalTabs } from "@/features/terminal/components/TerminalTabs"
import { useTerminalStore } from "@/features/terminal/terminalStore"
import { resolveInitialTerminalCwd } from "@/features/terminal/utils"

interface GhosttyTerminalViewProps {
  isExpanded: boolean
}

/**
 * Ghostty 风格多标签终端主视图容器（顶部水平标签栏 + 下方终端视口）。
 */
export const GhosttyTerminalView = ({
  isExpanded,
}: GhosttyTerminalViewProps): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const itemId = searchParams.get("itemId")

  const tabs = useTerminalStore((state) => state.tabs)
  const activeTabId = useTerminalStore((state) => state.activeTabId)
  const addTab = useTerminalStore((state) => state.addTab)

  const hasAutoCreatedRef = useRef(false)

  // 创建新标签页，根据当前选中条目解析对应工作目录。
  const handleCreateTab = useCallback(async (): Promise<void> => {
    const cwd = await resolveInitialTerminalCwd(itemId)
    addTab({ cwd, itemId: itemId ?? undefined })
  }, [itemId, addTab])

  // 首次展开时若没有任何终端，则自动创建一个默认终端。
  useEffect(() => {
    if (isExpanded && tabs.length === 0 && !hasAutoCreatedRef.current) {
      hasAutoCreatedRef.current = true
      void handleCreateTab()
    }
  }, [isExpanded, tabs.length, handleCreateTab])

  // 快捷键全局监听：在展开态下支持新建标签 (Cmd/Ctrl+T)、关闭 Pane/标签 (Cmd/Ctrl+W)、切标签 (Cmd/Ctrl+Shift+[/] 或 Cmd/Ctrl+1~9)、分屏 (Cmd/Ctrl+D 左右，Cmd/Ctrl+Shift+D 上下)
  useEffect(() => {
    if (!isExpanded) return

    const handleGlobalKeyDown = (event: KeyboardEvent): void => {
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
      const isModifier = isMac ? event.metaKey : event.ctrlKey

      if (!isModifier) return

      // Cmd/Ctrl + D: 分屏（不带 Shift 为左右分屏，带 Shift 为上下分屏）
      if (event.key.toLowerCase() === "d") {
        if (!activeTabId) return
        event.preventDefault()
        event.stopPropagation()
        const direction = event.shiftKey ? "vertical" : "horizontal"
        useTerminalStore.getState().splitPane(activeTabId, direction)
        return
      }

      // Cmd/Ctrl + T: 新建标签
      if (event.key.toLowerCase() === "t" && !event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        void handleCreateTab()
        return
      }

      // Cmd/Ctrl + W: 关闭当前激活的分屏 Pane（若仅剩 1 个则关闭该 Tab）
      if (event.key.toLowerCase() === "w" && !event.shiftKey) {
        if (activeTabId) {
          event.preventDefault()
          event.stopPropagation()
          const currentTab = useTerminalStore.getState().tabs.find((t) => t.id === activeTabId)
          if (currentTab) {
            useTerminalStore.getState().removePane(activeTabId, currentTab.activePaneId)
          }
        }
        return
      }

      // Cmd/Ctrl + Shift + [ / ]: 前后切换标签
      if (event.shiftKey && (event.key === "{" || event.key === "[")) {
        event.preventDefault()
        event.stopPropagation()
        const currentTabs = useTerminalStore.getState().tabs
        if (currentTabs.length <= 1) return
        const currentIndex = currentTabs.findIndex((t) => t.id === activeTabId)
        const prevIndex = currentIndex <= 0 ? currentTabs.length - 1 : currentIndex - 1
        const targetId = currentTabs[prevIndex]?.id
        if (targetId) useTerminalStore.getState().setActiveTab(targetId)
        return
      }

      if (event.shiftKey && (event.key === "}" || event.key === "]")) {
        event.preventDefault()
        event.stopPropagation()
        const currentTabs = useTerminalStore.getState().tabs
        if (currentTabs.length <= 1) return
        const currentIndex = currentTabs.findIndex((t) => t.id === activeTabId)
        const nextIndex = currentIndex >= currentTabs.length - 1 ? 0 : currentIndex + 1
        const targetId = currentTabs[nextIndex]?.id
        if (targetId) useTerminalStore.getState().setActiveTab(targetId)
        return
      }

      // Cmd/Ctrl + 1~9: 定位到第 N 个标签
      const digit = Number.parseInt(event.key, 10)
      if (!Number.isNaN(digit) && digit >= 1 && digit <= 9) {
        const currentTabs = useTerminalStore.getState().tabs
        const targetTab = currentTabs[digit - 1]
        if (targetTab) {
          event.preventDefault()
          event.stopPropagation()
          useTerminalStore.getState().setActiveTab(targetTab.id)
        }
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown, true)
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown, true)
    }
  }, [isExpanded, activeTabId, handleCreateTab])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#121212]">
      {/* 顶部水平栏：左侧滚动按钮 + Tab 列表 + 添加按钮 + 右侧滚动按钮 */}
      <div className="flex h-9 shrink-0 items-center border-b border-white/5 bg-white/[0.01] px-2 py-1">
        <TerminalTabs onAddTab={() => void handleCreateTab()} />
      </div>

      {/* 下方终端画布交互区 */}
      <div className="relative min-h-0 flex-1 w-full overflow-hidden">
        {tabs.map((tab) => {
          const isTabActive = tab.id === activeTabId

          return (
            <div
              key={tab.id}
              className={`h-full w-full overflow-hidden ${isTabActive ? "flex" : "hidden"}`}
            >
              <TerminalSplitView
                activePaneId={tab.activePaneId}
                isExpanded={isExpanded}
                isTabActive={isTabActive}
                node={tab.rootNode}
                panes={tab.panes}
                tabId={tab.id}
              />
            </div>
          )
        })}

        {tabs.length === 0 && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#141414] text-white/40">
            <TerminalIcon className="h-8 w-8 text-white/20" />
            <span className="text-xs">暂无打开的终端</span>
            <button
              className="mt-1 rounded-[4px] border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              type="button"
              onClick={() => void handleCreateTab()}
            >
              新建终端
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
