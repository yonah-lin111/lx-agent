import { Terminal as TerminalIcon } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { TerminalPane } from "@/features/terminal/components/TerminalPane"
import { TerminalTabs } from "@/features/terminal/components/TerminalTabs"
import { useTerminalStore } from "@/features/terminal/terminalStore"
import { resolveInitialTerminalCwd } from "@/features/terminal/utils"

interface GhosttyTerminalViewProps {
  isExpanded: boolean
  actions?: React.ReactNode
}

/**
 * Ghostty 风格多标签终端主视图容器（顶部水平标签栏 + 下方终端视口）。
 */
export const GhosttyTerminalView = ({
  isExpanded,
  actions,
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

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[4px] bg-[#141414]">
      {/* 顶部水平栏：左侧水平多标签页 + 右上角操作按钮 */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-white/5 bg-[#171717] px-2">
        <TerminalTabs onAddTab={() => void handleCreateTab()} />
        {actions && <div className="flex shrink-0 items-center gap-1 pl-2">{actions}</div>}
      </div>

      {/* 下方终端画布交互区 */}
      <div className="relative min-h-0 flex-1 w-full overflow-hidden">
        {tabs.map((tab) => (
          <TerminalPane
            key={tab.id}
            isActive={tab.id === activeTabId}
            isExpanded={isExpanded}
            tab={tab}
          />
        ))}

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
