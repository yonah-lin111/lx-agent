import {
  Activity,
  ChevronDown,
  ChevronsLeftRight,
  ChevronsRightLeft,
  ChevronUp,
  Terminal as TerminalIcon,
} from "lucide-react"
import type React from "react"
import { useEffect, useRef, useState } from "react"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { AgentJobsMonitorView } from "@/features/agent/components/AgentJobsMonitorView"
import { useAgentJobs } from "@/features/agent/hooks/useAgentJobs"
import { GhosttyTerminalView } from "@/features/terminal"
import { useTranslation } from "@/i18n"
import { useBottomSideBarStore } from "./bottomSideBarStore"

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
 * 页面底边栏布局容器：展开时支持 Ghostty 控制台终端与 Agent 长任务监控双视图无缝切换（保活控制台任务）。
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

  const viewMode = useBottomSideBarStore((state) => state.viewMode)
  const setViewMode = useBottomSideBarStore((state) => state.setViewMode)
  const { runningJobs } = useAgentJobs()

  // 拖拽顶部边缘调整高度：最小 15vh，最大动态计算预留顶部视口。
  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    resizeStartRef.current = { startY: event.clientY, startHeight: height }
    setIsResizing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleResizeMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = resizeStartRef.current
    if (!start) return
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

  const { t } = useTranslation()

  // 渲染右侧操作栏（包含控制台/长任务切换、覆盖右侧栏、折叠按钮）
  const renderRightActions = (): React.JSX.Element => (
    <div className="flex shrink-0 items-center gap-1">
      {/* 视图切换按钮：位于覆盖 icon 左侧 */}
      <LxIconButton
        aria-label={
          viewMode === "terminal" ? t("bottomBar.switchToJobs") : t("bottomBar.switchToTerminal")
        }
        title={{
          content:
            viewMode === "terminal"
              ? `${t("bottomBar.switchToJobs")}${
                  runningJobs.length > 0 ? ` ${t("bottomBar.runningCount", { count: runningJobs.length })}` : ""
                }`
              : t("bottomBar.switchToTerminal"),
          placement: "top",
        }}
        onClick={() => setViewMode(viewMode === "terminal" ? "jobs" : "terminal")}
        size="small"
      >
        {viewMode === "terminal" ? (
          <Activity
            className={`h-3.5 w-3.5 ${
              runningJobs.length > 0 ? "text-sky-400 animate-pulse" : "text-white/60"
            }`}
          />
        ) : (
          <TerminalIcon className="h-3.5 w-3.5 text-sky-400" />
        )}
      </LxIconButton>

      <LxIconButton
        aria-label={
          isCoveringRightSideBar
            ? t("bottomBar.uncoverRightSidebar")
            : t("bottomBar.coverRightSidebar")
        }
        title={{
          content: isCoveringRightSideBar
            ? t("bottomBar.uncoverRightSidebar")
            : t("bottomBar.coverRightSidebar"),
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
        aria-label={t("bottomBar.collapseBottomBar")}
        title={{ content: t("bottomBar.collapseBottomBar"), placement: "top" }}
        onClick={() => onExpandedChange(false)}
        size="small"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </LxIconButton>
    </div>
  )

  return (
    <aside
      className={`relative w-full shrink-0 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] ${
        isResizing
          ? "transition-none"
          : "transition-[height,min-height,max-height] duration-300 ease-in-out"
      } ${isExpanded ? "p-1.5" : "h-[40px] min-h-[40px] max-h-[40px] px-2 py-1"}`}
      style={
        isExpanded
          ? { height: `${height}vh`, minHeight: `${height}vh`, maxHeight: `${height}vh` }
          : undefined
      }
    >
      {/* 顶部拖拽调整高度把手：仅在展开态生效 */}
      {isExpanded && (
        <div
          aria-label={t("bottomBar.resizeBottomBar")}
          className="absolute top-0 left-0 right-0 z-10 h-1.5 cursor-row-resize touch-none hover:bg-white/10 transition-colors"
          onPointerCancel={handleResizeEnd}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
      )}

      <div className="relative flex h-full w-full flex-col overflow-hidden">
        {/* 展开区域：双视图常驻 DOM 保活（切换时不销毁控制台进程与任务） */}
        {isExpanded && (
          <div className="relative flex h-full w-full min-h-0 flex-1 overflow-hidden">
            <div
              className={`h-full w-full min-h-0 flex-1 overflow-hidden ${
                viewMode === "terminal" ? "flex" : "hidden"
              }`}
            >
              <GhosttyTerminalView isExpanded={isExpanded} rightActions={renderRightActions()} />
            </div>

            <div
              className={`h-full w-full min-h-0 flex-1 overflow-hidden ${
                viewMode === "jobs" ? "flex" : "hidden"
              }`}
            >
              <AgentJobsMonitorView isExpanded={isExpanded} rightActions={renderRightActions()} />
            </div>
          </div>
        )}

        {/* 折叠区域：紧凑 40px 状态栏，水平排列控制按钮 */}
        {!isExpanded && (
          <div className="flex h-full w-full items-center justify-between">
            <div className="min-w-0 flex-1">{children}</div>
            <div className="flex shrink-0 items-center gap-1 pl-2">
              <LxIconButton
                aria-label={
                  viewMode === "terminal"
                    ? t("bottomBar.switchToJobs")
                    : t("bottomBar.switchToTerminal")
                }
                title={{
                  content:
                    viewMode === "terminal"
                      ? `${t("bottomBar.switchToJobs")}${
                          runningJobs.length > 0
                            ? ` ${t("bottomBar.runningCount", { count: runningJobs.length })}`
                            : ""
                        }`
                      : t("bottomBar.switchToTerminal"),
                  placement: "top",
                }}
                onClick={() => {
                  setViewMode(viewMode === "terminal" ? "jobs" : "terminal")
                  onExpandedChange(true)
                }}
                size="small"
              >
                {viewMode === "terminal" ? (
                  <Activity
                    className={`h-3.5 w-3.5 ${
                      runningJobs.length > 0 ? "text-sky-400 animate-pulse" : "text-white/60"
                    }`}
                  />
                ) : (
                  <TerminalIcon className="h-3.5 w-3.5 text-sky-400" />
                )}
              </LxIconButton>

              <LxIconButton
                aria-label={
                  isCoveringRightSideBar
                    ? t("bottomBar.uncoverRightSidebar")
                    : t("bottomBar.coverRightSidebar")
                }
                title={{
                  content: isCoveringRightSideBar
                    ? t("bottomBar.uncoverRightSidebar")
                    : t("bottomBar.coverRightSidebar"),
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
                aria-label={t("common.expand")}
                title={{ content: t("common.expand"), placement: "top" }}
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
