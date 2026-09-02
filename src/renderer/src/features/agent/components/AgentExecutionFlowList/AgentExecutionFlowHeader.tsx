import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import type { ExecutionFlowStats, FilterKind } from "./types"

export interface AgentExecutionFlowHeaderProps {
  stepsCount: number
  activeFilter: FilterKind
  filterCounts: Record<FilterKind, number>
  stats: ExecutionFlowStats
  onFilterChange: (filter: FilterKind) => void
  showStats?: boolean
}

/**
 * 各筛选 Tab 对应的配色映射（基于主题语义 token 与柔和半透明色）
 */
const FILTER_TAB_COLORS: Record<
  FilterKind,
  {
    active: string
    inactive: string
    dot?: string
  }
> = {
  all: {
    active: "bg-white/15 text-[var(--color-theme-text,#ffffff)] font-semibold shadow-sm",
    inactive:
      "text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] hover:bg-white/5 hover:text-[var(--color-theme-text,#ffffff)]",
  },
  calls: {
    active: "bg-cyan-500/20 text-cyan-300 font-semibold ring-1 ring-cyan-500/30",
    inactive:
      "text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] hover:bg-cyan-500/10 hover:text-cyan-300",
    dot: "bg-cyan-400",
  },
  system: {
    active: "bg-indigo-500/20 text-indigo-300 font-semibold ring-1 ring-indigo-500/30",
    inactive:
      "text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] hover:bg-indigo-500/10 hover:text-indigo-300",
    dot: "bg-indigo-400",
  },
  tool: {
    active: "bg-amber-500/20 text-amber-300 font-semibold ring-1 ring-amber-500/30",
    inactive:
      "text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] hover:bg-amber-500/10 hover:text-amber-300",
    dot: "bg-amber-400",
  },
  thinking: {
    active: "bg-purple-500/20 text-purple-300 font-semibold ring-1 ring-purple-500/30",
    inactive:
      "text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] hover:bg-purple-500/10 hover:text-purple-300",
    dot: "bg-purple-400",
  },
  subagent: {
    active: "bg-blue-500/20 text-blue-300 font-semibold ring-1 ring-blue-500/30",
    inactive:
      "text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] hover:bg-blue-500/10 hover:text-blue-300",
    dot: "bg-blue-400",
  },
  user: {
    active: "bg-sky-500/20 text-sky-300 font-semibold ring-1 ring-sky-500/30",
    inactive:
      "text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] hover:bg-sky-500/10 hover:text-sky-300",
    dot: "bg-sky-400",
  },
  assistant: {
    active: "bg-emerald-500/20 text-emerald-300 font-semibold ring-1 ring-emerald-500/30",
    inactive:
      "text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] hover:bg-emerald-500/10 hover:text-emerald-300",
    dot: "bg-emerald-400",
  },
  compaction: {
    active: "bg-indigo-500/20 text-indigo-300 font-semibold ring-1 ring-indigo-500/30",
    inactive:
      "text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] hover:bg-indigo-500/10 hover:text-indigo-300",
    dot: "bg-indigo-400",
  },
  undo: {
    active: "bg-rose-500/20 text-rose-300 font-semibold ring-1 ring-rose-500/30",
    inactive:
      "text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] hover:bg-rose-500/10 hover:text-rose-300",
    dot: "bg-rose-400",
  },
  modelSwitch: {
    active: "bg-teal-500/20 text-teal-300 font-semibold ring-1 ring-teal-500/30",
    inactive:
      "text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] hover:bg-teal-500/10 hover:text-teal-300",
    dot: "bg-teal-400",
  },
  proposedPlan: {
    active: "bg-emerald-500/20 text-emerald-300 font-semibold ring-1 ring-emerald-500/30",
    inactive:
      "text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] hover:bg-emerald-500/10 hover:text-emerald-300",
    dot: "bg-emerald-400",
  },
  reviewFindings: {
    active: "bg-violet-500/20 text-violet-300 font-semibold ring-1 ring-violet-500/30",
    inactive:
      "text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] hover:bg-violet-500/10 hover:text-violet-300",
    dot: "bg-violet-400",
  },
  error: {
    active: "bg-rose-500/20 text-rose-300 font-semibold ring-1 ring-rose-500/30",
    inactive:
      "text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))] hover:bg-rose-500/10 hover:text-rose-300",
    dot: "bg-rose-400",
  },
}

/**
 * 执行流程顶部工具栏（分类筛选与统计指标）
 */
export const AgentExecutionFlowHeader = ({
  stepsCount,
  activeFilter,
  filterCounts,
  stats,
  onFilterChange,
  showStats = true,
}: AgentExecutionFlowHeaderProps): React.JSX.Element => {
  const { t } = useTranslation()

  // 顶部 tab 栏横向滚动控制
  const tabScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollTabLeft, setCanScrollTabLeft] = useState(false)
  const [canScrollTabRight, setCanScrollTabRight] = useState(false)

  const updateTabScrollState = useCallback((): void => {
    const el = tabScrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanScrollTabLeft(scrollLeft > 1)
    setCanScrollTabRight(scrollLeft < scrollWidth - clientWidth - 1)
  }, [])

  useEffect(() => {
    const el = tabScrollRef.current
    if (!el) return

    updateTabScrollState()

    const onScroll = (): void => updateTabScrollState()
    const onWheel = (event: WheelEvent): void => {
      if (!event.deltaY) return
      event.preventDefault()
      el.scrollLeft += event.deltaY
    }

    el.addEventListener("scroll", onScroll, { passive: true })
    el.addEventListener("wheel", onWheel, { passive: false })

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => updateTabScrollState())
        : null
    observer?.observe(el)

    return () => {
      el.removeEventListener("scroll", onScroll)
      el.removeEventListener("wheel", onWheel)
      observer?.disconnect()
    }
  }, [stepsCount, updateTabScrollState])

  const handleTabScroll = useCallback((direction: "left" | "right"): void => {
    const el = tabScrollRef.current
    if (!el) return
    el.scrollBy({ left: direction === "left" ? -160 : 160, behavior: "smooth" })
  }, [])

  const renderTab = (kind: FilterKind, label: string, count: number) => {
    const isActive = activeFilter === kind
    const tabColor = FILTER_TAB_COLORS[kind]
    return (
      <button
        key={kind}
        type="button"
        onClick={() => onFilterChange(kind)}
        className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[4px] px-2 py-0.5 font-mono text-[11px] transition-all select-none focus:outline-none ${
          isActive ? tabColor.active : tabColor.inactive
        }`}
      >
        {tabColor.dot && (
          <span
            aria-hidden
            className={`h-1.5 w-1.5 shrink-0 rounded-full transition-opacity ${tabColor.dot} ${
              isActive ? "opacity-100 ring-2 ring-white/10" : "opacity-40"
            }`}
          />
        )}
        <span>
          {label} ({count})
        </span>
      </button>
    )
  }

  return (
    <div className="agent-execution-flow-header flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-theme-border,rgba(255,255,255,0.08))] bg-[var(--color-theme-bg,#000000)]/40 px-2 py-1.5 select-none">
      {/* 左侧筛选 Tab 栏 */}
      {stepsCount > 0 ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <LxIconButton
            aria-label={t("project.scrollLeft")}
            disabled={!canScrollTabLeft}
            size="small"
            onClick={() => handleTabScroll("left")}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </LxIconButton>
          <div
            ref={tabScrollRef}
            className="scrollbar-hidden flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          >
            {renderTab("all", t("agent.filterAll"), filterCounts.all)}
            {filterCounts.calls > 0 &&
              renderTab("calls", t("agent.filterCalls"), filterCounts.calls)}
            {filterCounts.system > 0 &&
              renderTab("system", t("agent.filterSystem"), filterCounts.system)}
            {filterCounts.tool > 0 && renderTab("tool", t("agent.filterTools"), filterCounts.tool)}
            {filterCounts.thinking > 0 &&
              renderTab("thinking", t("agent.filterThinking"), filterCounts.thinking)}
            {filterCounts.subagent > 0 &&
              renderTab("subagent", t("agent.filterSubagent"), filterCounts.subagent)}
            {filterCounts.user > 0 && renderTab("user", t("agent.filterUser"), filterCounts.user)}
            {filterCounts.assistant > 0 &&
              renderTab("assistant", t("agent.filterAssistant"), filterCounts.assistant)}
            {filterCounts.undo > 0 && renderTab("undo", t("agent.kindUndo"), filterCounts.undo)}
            {filterCounts.error > 0 &&
              renderTab("error", t("agent.filterError"), filterCounts.error)}
          </div>
          <LxIconButton
            aria-label={t("project.scrollRight")}
            disabled={!canScrollTabRight}
            size="small"
            onClick={() => handleTabScroll("right")}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </LxIconButton>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* 顶部右侧操作栏 */}
      <div className="flex shrink-0 items-center gap-1">
        {showStats && (
          <LxTooltip
            multiline
            placement="bottom"
            content={
              <div className="flex flex-col gap-1 whitespace-nowrap font-mono text-[11px]">
                <div className="font-bold text-[var(--color-theme-text,#ffffff)]">
                  {t("agent.turnCount", { count: stats.turnsCount })} · {stats.totalSteps}
                </div>
                <div className="text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
                  {t("agent.toolCallsCount", { count: stats.toolCallsCount })}
                </div>
                <div className="my-0.5 h-[1px] bg-[var(--color-theme-border,rgba(255,255,255,0.1))]" />
                {stats.inputTokens > 0 && (
                  <span>{t("agent.inputTokens", { count: stats.inputTokens })}</span>
                )}
                {stats.outputTokens > 0 && (
                  <span>{t("agent.outputTokens", { count: stats.outputTokens })}</span>
                )}
                {stats.cacheReadTokens > 0 && (
                  <span className="text-sky-300">
                    {t("agent.cacheReadTokens", { count: stats.cacheReadTokens })}
                  </span>
                )}
                {stats.totalTokens > 0 && (
                  <span>{t("agent.totalTokens", { count: stats.totalTokens })}</span>
                )}
              </div>
            }
          >
            <LxIconButton size="small" aria-label={t("agent.viewStats")}>
              <BarChart3 className="h-3.5 w-3.5" />
            </LxIconButton>
          </LxTooltip>
        )}
      </div>
    </div>
  )
}
