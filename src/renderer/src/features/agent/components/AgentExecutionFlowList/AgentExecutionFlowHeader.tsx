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

  return (
    <div className="agent-execution-flow-header flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-2 py-1.5 select-none">
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
            <button
              type="button"
              onClick={() => onFilterChange("all")}
              className={`shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                activeFilter === "all"
                  ? "bg-white/15 text-white"
                  : "text-white/40 hover:bg-white/5 hover:text-white/70"
              }`}
            >
              {t("agent.filterAll")} ({filterCounts.all})
            </button>
            {filterCounts.system > 0 && (
              <button
                type="button"
                onClick={() => onFilterChange("system")}
                className={`shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  activeFilter === "system"
                    ? "bg-indigo-500/20 text-indigo-300"
                    : "text-white/40 hover:bg-white/5 hover:text-white/70"
                }`}
              >
                {t("agent.filterSystem")} ({filterCounts.system})
              </button>
            )}
            {filterCounts.tool > 0 && (
              <button
                type="button"
                onClick={() => onFilterChange("tool")}
                className={`shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  activeFilter === "tool"
                    ? "bg-sky-500/20 text-sky-300"
                    : "text-white/40 hover:bg-white/5 hover:text-white/70"
                }`}
              >
                {t("agent.filterTools")} ({filterCounts.tool})
              </button>
            )}
            {filterCounts.thinking > 0 && (
              <button
                type="button"
                onClick={() => onFilterChange("thinking")}
                className={`shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  activeFilter === "thinking"
                    ? "bg-purple-500/20 text-purple-300"
                    : "text-white/40 hover:bg-white/5 hover:text-white/70"
                }`}
              >
                {t("agent.filterThinking")} ({filterCounts.thinking})
              </button>
            )}
            {filterCounts.subagent > 0 && (
              <button
                type="button"
                onClick={() => onFilterChange("subagent")}
                className={`shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  activeFilter === "subagent"
                    ? "bg-blue-500/20 text-blue-300"
                    : "text-white/40 hover:bg-white/5 hover:text-white/70"
                }`}
              >
                {t("agent.filterSubagent")} ({filterCounts.subagent})
              </button>
            )}
            {filterCounts.user > 0 && (
              <button
                type="button"
                onClick={() => onFilterChange("user")}
                className={`shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  activeFilter === "user"
                    ? "bg-amber-500/20 text-amber-300"
                    : "text-white/40 hover:bg-white/5 hover:text-white/70"
                }`}
              >
                {t("agent.filterUser")} ({filterCounts.user})
              </button>
            )}
            {filterCounts.assistant > 0 && (
              <button
                type="button"
                onClick={() => onFilterChange("assistant")}
                className={`shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  activeFilter === "assistant"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "text-white/40 hover:bg-white/5 hover:text-white/70"
                }`}
              >
                {t("agent.filterAssistant")} ({filterCounts.assistant})
              </button>
            )}
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
        {/* 统计指标浮层 */}
        <LxTooltip
          multiline
          placement="bottom"
          content={
            <div className="flex flex-col gap-1 whitespace-nowrap text-[12px]">
              <div className="font-bold text-white/90">
                {t("agent.turnCount", { count: stats.turnsCount })} · {stats.totalSteps}
              </div>
              <div className="text-white/60">
                {t("agent.toolCallsCount", { count: stats.toolCallsCount })}
              </div>
              <div className="my-0.5 h-[1px] bg-white/10" />
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
      </div>
    </div>
  )
}
