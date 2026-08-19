import type React from "react"
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
 * 递归二叉分屏渲染器：支持任意深度的左右 (horizontal) 与上下 (vertical) 嵌套分屏。
 */
export const TerminalSplitView = ({
  node,
  panes,
  tabId,
  activePaneId,
  isTabActive,
  isExpanded,
}: TerminalSplitViewProps): React.JSX.Element | null => {
  if (node.type === "leaf") {
    const pane = panes[node.paneId]
    if (!pane) return null

    return (
      <TerminalPane
        isActive={isTabActive}
        isExpanded={isExpanded}
        isFocused={node.paneId === activePaneId}
        onFocus={() => useTerminalStore.getState().setActivePane(tabId, node.paneId)}
        pane={pane}
      />
    )
  }

  const isHorizontal = node.direction === "horizontal"

  return (
    <div
      className={`h-full w-full min-h-0 min-w-0 flex-1 overflow-hidden ${
        isHorizontal
          ? "flex flex-row divide-x divide-white/10"
          : "flex flex-col divide-y divide-white/10"
      }`}
    >
      <TerminalSplitView
        activePaneId={activePaneId}
        isExpanded={isExpanded}
        isTabActive={isTabActive}
        node={node.children[0]}
        panes={panes}
        tabId={tabId}
      />
      <TerminalSplitView
        activePaneId={activePaneId}
        isExpanded={isExpanded}
        isTabActive={isTabActive}
        node={node.children[1]}
        panes={panes}
        tabId={tabId}
      />
    </div>
  )
}
