import type React from "react"
import { useRef } from "react"
import { SplitDivider } from "@/features/terminal/components/SplitDivider"
import { TerminalPane } from "@/features/terminal/components/TerminalPane"
import { useTerminalStore } from "@/features/terminal/terminalStore"
import type { SplitNode, TerminalPaneItem } from "@/features/terminal/types"

interface TerminalSplitViewProps {
  node: SplitNode
  panes: Record<string, TerminalPaneItem>
  tabId: string
  activePaneId: string
  isTabActive: boolean
  isExpanded: boolean
}

/**
 * 递归二叉分屏渲染器：支持任意深度的左右 (horizontal) 与上下 (vertical) 嵌套分屏及拖拽调比。
 */
export const TerminalSplitView = ({
  node,
  panes,
  tabId,
  activePaneId,
  isTabActive,
  isExpanded,
}: TerminalSplitViewProps): React.JSX.Element | null => {
  const containerRef = useRef<HTMLDivElement>(null)

  if (node.type === "leaf") {
    const pane = panes[node.paneId]
    if (!pane) return null

    const totalPanes = Object.keys(panes).length
    const showHeader = totalPanes > 1

    return (
      <TerminalPane
        isActive={isTabActive}
        isExpanded={isExpanded}
        isFocused={node.paneId === activePaneId}
        onClose={() => useTerminalStore.getState().removePane(tabId, node.paneId)}
        onFocus={() => useTerminalStore.getState().setActivePane(tabId, node.paneId)}
        pane={pane}
        showHeader={showHeader}
      />
    )
  }

  const isHorizontal = node.direction === "horizontal"
  const ratio = node.ratio ?? 0.5

  return (
    <div
      ref={containerRef}
      className={`h-full w-full min-h-0 min-w-0 flex-1 overflow-hidden ${
        isHorizontal ? "flex flex-row" : "flex flex-col"
      }`}
    >
      <div className="min-h-0 min-w-0 overflow-hidden" style={{ flex: `${ratio} ${ratio} 0%` }}>
        <TerminalSplitView
          activePaneId={activePaneId}
          isExpanded={isExpanded}
          isTabActive={isTabActive}
          node={node.children[0]}
          panes={panes}
          tabId={tabId}
        />
      </div>

      <SplitDivider
        containerRef={containerRef}
        direction={node.direction}
        onDoubleClick={() => useTerminalStore.getState().setSplitRatio(tabId, node.id, 0.5)}
        onResize={(newRatio) => useTerminalStore.getState().setSplitRatio(tabId, node.id, newRatio)}
      />

      <div
        className="min-h-0 min-w-0 overflow-hidden"
        style={{ flex: `${1 - ratio} ${1 - ratio} 0%` }}
      >
        <TerminalSplitView
          activePaneId={activePaneId}
          isExpanded={isExpanded}
          isTabActive={isTabActive}
          node={node.children[1]}
          panes={panes}
          tabId={tabId}
        />
      </div>
    </div>
  )
}
