import { ChevronDown, ChevronsLeftRight, ChevronsRightLeft, ChevronUp } from "lucide-react"
import type React from "react"
import { useEffect, useRef, useState } from "react"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { GhosttyTerminalView } from "@/features/terminal"

// 展开态最小高度（相对视口高度，单位 vh）。
export const MIN_HEIGHT_VH = 15
export const DEFAULT_HEIGHT_VH = 30
// 顶部预留最小像素：保证 HeaderSideBar(48px) + MarkdownEditorToolbar(36px) + MarkdownStatusBar(32px) + 间距/边框(40px) 完全显示
export const RESERVED_TOP_HEIGHT_PX = 156

/**
 * 根据当前视口高度与顶部预留像素，动态计算底边栏允许拖拽的最大高度（vh）。
 */
export const calculateMaxHeightVh = (
  windowHeight: number = typeof window !== "undefined" ? window.innerHeight : 900,
  reservedTopPx: number = RESERVED_TOP_HEIGHT_PX,
): number => {
  if (windowHeight <= 0) return 85
  const maxAllowedPx = Math.max(windowHeight * (MIN_HEIGHT_VH / 100), windowHeight - reservedTopPx)
  return Math.min(95, Math.max(MIN_HEIGHT_VH, (maxAllowedPx / windowHeight) * 100))
}

/**
 * 约束高度到 [MIN_HEIGHT_VH, calculateMaxHeightVh()]。
 */
export const clampHeight = (
  value: number,
  windowHeight: number = typeof window !== "undefined" ? window.innerHeight : 900,
  reservedTopPx: number = RESERVED_TOP_HEIGHT_PX,
): number => {
  const maxVh = calculateMaxHeightVh(windowHeight, reservedTopPx)
  return Math.min(Math.max(value, MIN_HEIGHT_VH), maxVh)
}

// 页面底边栏属性。
interface BottomSideBarProps {
  children?: React.ReactNode
  isCoveringRightSideBar: boolean
  isExpanded: boolean
  onCoveringRightSideBarChange: (isCoveringRightSideBar: boolean) => void
  onExpandedChange: (isExpanded: boolean) => void
}

/**
 * 页面底边栏布局容器：展开时左侧为 Ghostty 终端（带独立边框与 Tab 栏），右侧为覆盖与折叠控制按钮。
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

  // 拖拽顶部边缘调整高度：最小 15vh，最大动态计算预留顶部视口。
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
    setHeight(clampHeight(next, window.innerHeight))
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
        {/* 展开区域：左侧终端视口，右侧操作列（覆盖右侧栏与折叠底边栏） */}
        <div
          className={`h-full w-full min-h-0 flex-1 items-start gap-2 overflow-hidden ${
            isExpanded ? "flex" : "hidden"
          }`}
        >
          {/* 左侧主视口：Ghostty 多标签终端 */}
          <div className="h-full min-w-0 flex-1 overflow-hidden">
            <GhosttyTerminalView isExpanded={isExpanded} />
          </div>

          {/* 右侧操作列：覆盖右侧栏与折叠底边栏（pt-1 保持与顶栏对齐） */}
          <div className="flex shrink-0 flex-col items-center gap-1.5 pt-1 pr-0.5">
            <LxIconButton
              aria-label="折叠底边栏"
              title={{ content: "折叠底边栏", placement: "left" }}
              onClick={() => onExpandedChange(false)}
              size="small"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </LxIconButton>
            <LxIconButton
              aria-label={
                isCoveringRightSideBar ? "底边栏不覆盖右侧栏宽度" : "底边栏覆盖右侧栏宽度"
              }
              title={{
                content: isCoveringRightSideBar ? "底边栏不覆盖右侧栏宽度" : "底边栏覆盖右侧栏宽度",
                placement: "left",
              }}
              onClick={() => onCoveringRightSideBarChange(!isCoveringRightSideBar)}
              size="small"
            >
              {isCoveringRightSideBar ? (
                <ChevronsRightLeft className="h-3.5 w-3.5" />
              ) : (
                <ChevronsLeftRight className="h-3.5 w-3.5" />
              )}
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
                size="small"
              >
                {isCoveringRightSideBar ? (
                  <ChevronsRightLeft className="h-3.5 w-3.5" />
                ) : (
                  <ChevronsLeftRight className="h-3.5 w-3.5" />
                )}
              </LxIconButton>
              <LxIconButton
                aria-label="展开底边栏"
                title={{ content: "展开底边栏", placement: "top" }}
                onClick={() => onExpandedChange(true)}
                size="small"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </LxIconButton>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
