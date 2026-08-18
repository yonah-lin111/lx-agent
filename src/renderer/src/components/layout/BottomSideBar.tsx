import { ChevronDown, ChevronsLeftRight, ChevronsRightLeft, ChevronUp } from "lucide-react"
import type React from "react"
import { useEffect, useRef, useState } from "react"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { GhosttyTerminalView } from "@/features/terminal"

// 展开态最小/最大高度（相对视口高度，单位 vh）。
const MIN_HEIGHT_VH = 15
const DEFAULT_HEIGHT_VH = 30
const MAX_HEIGHT_VH = 50

// 约束高度到 [15vh, 50vh]。
const clampHeight = (value: number): number =>
  Math.min(Math.max(value, MIN_HEIGHT_VH), MAX_HEIGHT_VH)

// 页面底边栏属性。
interface BottomSideBarProps {
  children?: React.ReactNode
  isCoveringRightSideBar: boolean
  isExpanded: boolean
  onCoveringRightSideBarChange: (isCoveringRightSideBar: boolean) => void
  onExpandedChange: (isExpanded: boolean) => void
}

/**
 * 页面底边栏布局容器：展开时上方为 Ghostty 终端（水平标签栏 + 右上角控制按钮，支持顶部拖拽调整高度至 50vh）。
 */
export const BottomSideBar = ({
  children,
  isCoveringRightSideBar,
  isExpanded,
  onCoveringRightSideBarChange,
  onExpandedChange,
}: BottomSideBarProps): React.JSX.Element => {
  const [height, setHeight] = useState<number>(DEFAULT_HEIGHT_VH)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartRef = useRef<{ startY: number; startHeight: number } | null>(null)

  // 拖拽顶部边缘调整高度：最小 15vh，最大 50vh。
  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    resizeStartRef.current = { startY: event.clientY, startHeight: height }
    setIsResizing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleResizeMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = resizeStartRef.current
    if (!start) return
    // 向上拖拽（clientY 变小）高度增加，向下拖拽（clientY 变大）高度减小。
    const next = start.startHeight + (start.startY - event.clientY) / (window.innerHeight / 100)
    setHeight(clampHeight(next))
  }

  const handleResizeEnd = (event: React.PointerEvent<HTMLDivElement>): void => {
    resizeStartRef.current = null
    setIsResizing(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  // 拖拽期间禁用文本选中，避免误选内容。
  useEffect(() => {
    if (!isResizing) return
    const previous = document.body.style.userSelect
    document.body.style.userSelect = "none"
    return () => {
      document.body.style.userSelect = previous
    }
  }, [isResizing])

  // 右上角动作控制按钮组（覆盖右侧栏切换 + 展开/折叠）
  const actionButtons = (
    <div className="flex shrink-0 items-center gap-1">
      <LxIconButton
        aria-label={isCoveringRightSideBar ? "底边栏不覆盖右侧栏宽度" : "底边栏覆盖右侧栏宽度"}
        size="small"
        title={{
          content: isCoveringRightSideBar ? "底边栏不覆盖右侧栏宽度" : "底边栏覆盖右侧栏宽度",
          placement: "top",
        }}
        onClick={() => onCoveringRightSideBarChange(!isCoveringRightSideBar)}
      >
        {isCoveringRightSideBar ? (
          <ChevronsRightLeft className="h-3.5 w-3.5" />
        ) : (
          <ChevronsLeftRight className="h-3.5 w-3.5" />
        )}
      </LxIconButton>
      <LxIconButton
        aria-label={isExpanded ? "折叠底边栏" : "展开底边栏"}
        size="small"
        title={{ content: isExpanded ? "折叠底边栏" : "展开底边栏", placement: "top" }}
        onClick={() => onExpandedChange(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5" />
        )}
      </LxIconButton>
    </div>
  )

  return (
    <aside
      className={`relative w-full shrink-0 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] ${
        isResizing
          ? "transition-none"
          : "transition-[height,min-height,max-height] duration-300 ease-in-out"
      } ${isExpanded ? "p-1.5" : "h-[40px] min-h-[40px] max-h-[40px] px-2 py-1.5"}`}
      style={
        isExpanded
          ? { height: `${height}vh`, minHeight: `${height}vh`, maxHeight: `${height}vh` }
          : undefined
      }
    >
      {/* 顶部拖拽调整高度把手：仅在展开态生效 */}
      {isExpanded && (
        <div
          aria-label="调整底边栏高度"
          className="absolute top-0 left-0 right-0 z-10 h-1.5 cursor-row-resize touch-none hover:bg-white/10 transition-colors"
          onPointerCancel={handleResizeEnd}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
      )}

      <div className="relative flex h-full w-full flex-col overflow-hidden">
        {/* 展开区域：Ghostty 多标签终端系统（水平顶部标签 + 右上角控制按钮） */}
        <div
          className={`h-full w-full min-h-0 flex-1 overflow-hidden ${isExpanded ? "block" : "hidden"}`}
        >
          <GhosttyTerminalView actions={actionButtons} isExpanded={isExpanded} />
        </div>

        {/* 折叠区域：紧凑状态栏，垂直居中完整展示右侧控制按钮 */}
        {!isExpanded && (
          <div className="flex h-full w-full items-center justify-between">
            <div className="min-w-0 flex-1">{children}</div>
            <div className="flex shrink-0 items-center pl-2">{actionButtons}</div>
          </div>
        )}
      </div>
    </aside>
  )
}
