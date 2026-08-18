import { ChevronDown, ChevronsLeftRight, ChevronsRightLeft, ChevronUp } from "lucide-react"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import { useLocation } from "react-router-dom"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { ProjectReferencedFolderTags } from "@/features/project"
import { GhosttyTerminalView } from "@/features/terminal"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

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
 * 页面底边栏布局容器：展开时上方为 Ghostty 终端（顶部支持拖拽调整高度至 50vh），下方为文件夹引用与控制栏。
 */
export const BottomSideBar = ({
  children,
  isCoveringRightSideBar,
  isExpanded,
  onCoveringRightSideBarChange,
  onExpandedChange,
}: BottomSideBarProps): React.JSX.Element => {
  const { pathname } = useLocation()
  const isProjectPage = pathname === PAGE_ROUTES.project

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

  return (
    <aside
      className={`relative w-full shrink-0 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] p-2 ${
        isResizing
          ? "transition-none"
          : "transition-[height,min-height,max-height] duration-300 ease-in-out"
      } ${isExpanded ? "" : "h-[40px] min-h-[40px] max-h-[40px]"}`}
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
        {/* 展开区域：Ghostty 多标签终端系统 */}
        <div className={`min-h-0 flex-1 overflow-hidden mb-1.5 ${isExpanded ? "block" : "hidden"}`}>
          <GhosttyTerminalView isExpanded={isExpanded} />
        </div>

        {/* 底部固定栏：文件夹引用标签与折叠/展开操作 */}
        <div className="relative h-[24px] shrink-0">
          {isProjectPage && <ProjectReferencedFolderTags isExpanded={isExpanded} />}
          {children}
          <div className="absolute right-0 bottom-0 flex gap-1">
            <LxIconButton
              aria-label={
                isCoveringRightSideBar ? "底边栏不覆盖右侧栏宽度" : "底边栏覆盖右侧栏宽度"
              }
              title={{
                content: isCoveringRightSideBar ? "底边栏不覆盖右侧栏宽度" : "底边栏覆盖右侧栏宽度",
                placement: "top",
              }}
              onClick={() => onCoveringRightSideBarChange(!isCoveringRightSideBar)}
            >
              {isCoveringRightSideBar ? (
                <ChevronsRightLeft className="h-4 w-4" />
              ) : (
                <ChevronsLeftRight className="h-4 w-4" />
              )}
            </LxIconButton>
            <LxIconButton
              aria-label={isExpanded ? "折叠底边栏" : "展开底边栏"}
              title={{ content: isExpanded ? "折叠底边栏" : "展开底边栏", placement: "top" }}
              onClick={() => onExpandedChange(!isExpanded)}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </LxIconButton>
          </div>
        </div>
      </div>
    </aside>
  )
}
