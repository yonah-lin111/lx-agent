import { ChevronDown, ChevronsLeftRight, ChevronsRightLeft, ChevronUp, Plus } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { LxIconButton } from "@/components/ui/LxIconButton"
import {
  GhosttyTerminalView,
  resolveInitialTerminalCwd,
  useTerminalStore,
} from "@/features/terminal"

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
 * 页面底边栏布局容器：展开时左侧列放置添加终端按钮，中间为 Ghostty 终端（带独立边框），右侧列放置覆盖与折叠按钮。
 */
export const BottomSideBar = ({
  children,
  isCoveringRightSideBar,
  isExpanded,
  onCoveringRightSideBarChange,
  onExpandedChange,
}: BottomSideBarProps): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const itemId = searchParams.get("itemId")
  const addTab = useTerminalStore((state) => state.addTab)

  const [height, setHeight] = useState<number>(DEFAULT_HEIGHT_VH)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartRef = useRef<{ startY: number; startHeight: number } | null>(null)

  // 新建终端标签
  const handleAddTab = useCallback(async (): Promise<void> => {
    const cwd = await resolveInitialTerminalCwd(itemId)
    addTab({ cwd, itemId: itemId ?? undefined })
  }, [itemId, addTab])

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
      className={`relative w-full shrink-0 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] ${
        isResizing
          ? "transition-none"
          : "transition-[height,min-height,max-height] duration-300 ease-in-out"
      } ${isExpanded ? "p-2" : "h-[40px] min-h-[40px] max-h-[40px] px-2 py-1"}`}
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
        {/* 展开区域：左侧留列放添加按钮，中间为独立终端，右侧留列放覆盖与折叠按钮 */}
        <div
          className={`h-full w-full min-h-0 flex-1 items-start gap-2 overflow-hidden ${
            isExpanded ? "flex" : "hidden"
          }`}
        >
          {/* 左侧操作列：新建终端 */}
          <div className="flex shrink-0 flex-col items-center pl-0.5">
            <LxIconButton
              aria-label="新建终端"
              title={{ content: "新建终端", placement: "right" }}
              onClick={() => void handleAddTab()}
            >
              <Plus className="h-4 w-4" />
            </LxIconButton>
          </div>

          {/* 中间主视口：Ghostty 多标签终端 */}
          <div className="h-full min-w-0 flex-1 overflow-hidden">
            <GhosttyTerminalView isExpanded={isExpanded} />
          </div>

          {/* 右侧操作列：覆盖右侧栏与折叠底边栏 */}
          <div className="flex shrink-0 flex-col items-center gap-1.5 pr-0.5">
            <LxIconButton
              aria-label={
                isCoveringRightSideBar ? "底边栏不覆盖右侧栏宽度" : "底边栏覆盖右侧栏宽度"
              }
              title={{
                content: isCoveringRightSideBar ? "底边栏不覆盖右侧栏宽度" : "底边栏覆盖右侧栏宽度",
                placement: "left",
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
              aria-label="折叠底边栏"
              title={{ content: "折叠底边栏", placement: "left" }}
              onClick={() => onExpandedChange(false)}
            >
              <ChevronDown className="h-4 w-4" />
            </LxIconButton>
          </div>
        </div>

        {/* 折叠区域：紧凑 40px 状态栏，水平排列控制按钮 */}
        {!isExpanded && (
          <div className="flex h-full w-full items-center justify-between">
            <div className="min-w-0 flex-1">{children}</div>
            <div className="flex shrink-0 items-center gap-1 pl-2">
              <LxIconButton
                aria-label={
                  isCoveringRightSideBar ? "底边栏不覆盖右侧栏宽度" : "底边栏覆盖右侧栏宽度"
                }
                title={{
                  content: isCoveringRightSideBar
                    ? "底边栏不覆盖右侧栏宽度"
                    : "底边栏覆盖右侧栏宽度",
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
                aria-label="展开底边栏"
                title={{ content: "展开底边栏", placement: "top" }}
                onClick={() => onExpandedChange(true)}
              >
                <ChevronUp className="h-4 w-4" />
              </LxIconButton>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
