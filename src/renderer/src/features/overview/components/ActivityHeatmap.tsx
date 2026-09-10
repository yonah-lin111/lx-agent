import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import type { ActivityDayEntry, HeatmapCell, HeatmapMonth } from "../types"
import { buildHeatmapMonths } from "../utils"

// 活动热力图属性。
export interface ActivityHeatmapProps {
  entries: ActivityDayEntry[]
  selectedProjectId?: string
  projectOptions?: LxSelectOption<string>[]
  onProjectChange?: (projectId: string) => void
}

const LEVEL_CLASS_MAP: Record<HeatmapCell["level"], string> = {
  0: "bg-[#282828] border border-[#383838] hover:border-[#555555]",
  1: "bg-[#144222] border border-[#1b582e] hover:border-[#22c55e]",
  2: "bg-[#1b6b33] border border-[#238c43] hover:border-[#4ade80]",
  3: "bg-[#229948] border border-[#2bc45c] hover:border-[#86efac]",
  4: "bg-[#22c55e] border border-[#4ade80] hover:brightness-110 hover:shadow-xs hover:shadow-emerald-500/25",
}

const WEEKDAY_SHORT_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""]

interface HeatmapDayCellProps {
  day: HeatmapCell | null
  onHover: (day: HeatmapCell, rect: DOMRect) => void
  onLeave: () => void
}

/**
 * 单个热力图方格单元（纯净原生节点，移除内联组件与 Hook 开销，实现 60 FPS 满帧丝滑性能）。
 */
const HeatmapDayCell = React.memo(
  ({ day, onHover, onLeave }: HeatmapDayCellProps): React.JSX.Element => {
    if (!day) {
      return (
        <div className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 rounded-[2px] opacity-0 pointer-events-none" />
      )
    }

    return (
      <div
        tabIndex={0}
        data-date={day.date}
        data-count={day.count}
        data-level={day.level}
        onMouseEnter={(e) => onHover(day, e.currentTarget.getBoundingClientRect())}
        onMouseLeave={onLeave}
        onFocus={(e) => onHover(day, e.currentTarget.getBoundingClientRect())}
        onBlur={onLeave}
        className={`overview-heatmap-cell h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 cursor-pointer rounded-[2px] hover:transition-colors hover:duration-75 ${LEVEL_CLASS_MAP[day.level]}`}
      />
    )
  },
)

HeatmapDayCell.displayName = "HeatmapDayCell"

interface MonthBlockProps {
  month: HeatmapMonth
  showWeekdayLabels?: boolean
  onHover: (day: HeatmapCell, rect: DOMRect) => void
  onLeave: () => void
}

/**
 * 单个月份独立周列网格（使用 contain:layout_paint 与 will-change:transform 进行 GPU 合成隔离，避免重排下钻）。
 */
const MonthBlock = React.memo(
  ({ month, showWeekdayLabels = false, onHover, onLeave }: MonthBlockProps): React.JSX.Element => {
    return (
      <div
        data-month-key={month.monthKey}
        className="overview-month-block flex items-start gap-1.5 shrink-0 [contain:layout_paint] [will-change:transform]"
      >
        {/* 当处于当前行行首时，显示星期基准标签（严格对齐 Mon..Sun 7 天基线） */}
        {showWeekdayLabels && (
          <div className="flex flex-col gap-1 pr-1 text-[9px] text-white/35 select-none shrink-0 pt-[22px]">
            {DAY_LABELS.map((label, idx) => (
              <div key={idx} className="flex h-3 w-5 items-center leading-none sm:h-3.5 sm:w-6">
                {label}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col items-center gap-1.5 shrink-0">
          {/* 月份名称 */}
          <div className="h-4 text-[11px] font-medium leading-none text-white/50 select-none">
            {month.label}
          </div>

          {/* 该月份的所有周列 */}
          <div className="flex gap-1">
            {month.weeks.map((week) => (
              <div key={week.weekIndex} className="flex flex-col gap-1 shrink-0">
                {week.days.map((day, dayIndex) => (
                  <HeatmapDayCell
                    key={day ? day.date : `empty-${dayIndex}`}
                    day={day}
                    onHover={onHover}
                    onLeave={onLeave}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  },
)

MonthBlock.displayName = "MonthBlock"

/**
 * 渲染生产力绿墙热力图：
 * 1. 宽度足够时全月单行平铺，宽度不足时逐月自适应折行，杜绝横向滚动条；
 * 2. 统一使用项目标准 LxTooltip 组件，以单例控制器挂载，彻底清除 9,400+ 个 Hook 造成的渲染颠簸；
 * 3. 严格对齐 Mon..Sun 7 天垂直基线，单元格放大至 14px。
 */
export const ActivityHeatmap = ({
  entries,
  selectedProjectId,
  projectOptions,
  onProjectChange,
}: ActivityHeatmapProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { months, maxCount } = useMemo(() => buildHeatmapMonths(entries), [entries])

  const totalYearActivities = useMemo(
    () => entries.reduce((acc, curr) => acc + curr.count, 0),
    [entries],
  )

  const [activeTooltip, setActiveTooltip] = useState<{
    day: HeatmapCell
    rect: DOMRect
  } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const [rowStartMonthKeys, setRowStartMonthKeys] = useState<Set<string>>(
    () => new Set(months.length > 0 ? [months[0].monthKey] : []),
  )

  const updateRowStarts = useCallback(() => {
    if (!containerRef.current) return
    const blocks = containerRef.current.querySelectorAll<HTMLElement>(".overview-month-block")
    if (blocks.length === 0) return

    const newStarts = new Set<string>()
    let prevTop = -1

    blocks.forEach((block) => {
      const key = block.dataset.monthKey
      if (!key) return
      const top = block.offsetTop
      if (prevTop === -1 || top > prevTop + 15) {
        newStarts.add(key)
        prevTop = top
      }
    })

    setRowStartMonthKeys((prev) => {
      if (prev.size === newStarts.size && Array.from(prev).every((k) => newStarts.has(k))) {
        return prev
      }
      return newStarts
    })
  }, [])

  useLayoutEffect(() => {
    updateRowStarts()
  }, [updateRowStarts, months])

  useEffect(() => {
    if (!containerRef.current) return
    let rafId: number | null = null

    const onResize = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(updateRowStarts)
    }

    const observer = new ResizeObserver(onResize)
    observer.observe(containerRef.current)
    window.addEventListener("resize", onResize)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      observer.disconnect()
      window.removeEventListener("resize", onResize)
    }
  }, [updateRowStarts])

  const handleHover = useCallback((day: HeatmapCell, rect: DOMRect): void => {
    setActiveTooltip({ day, rect })
  }, [])

  const handleLeave = useCallback((): void => {
    setActiveTooltip(null)
  }, [])

  // 页面滚动时立即收起悬浮气泡，避免视觉漂移
  useEffect(() => {
    if (!activeTooltip) return
    const handleScroll = (): void => setActiveTooltip(null)
    window.addEventListener("scroll", handleScroll, true)
    return () => window.removeEventListener("scroll", handleScroll, true)
  }, [activeTooltip])

  // 计算当前悬浮单元格的提示文字
  const tooltipContent = useMemo(() => {
    if (!activeTooltip) return null
    const { day } = activeTooltip
    const dateObj = new Date(`${day.date}T00:00:00`)
    const weekday = WEEKDAY_SHORT_NAMES[dateObj.getDay()]

    return day.count > 0
      ? `${day.date} (${weekday}): ${t("home.heatmap.activitiesDetail", {
          count: day.count,
          turns: day.turns,
          toolCalls: day.toolCalls,
        })}`
      : `${day.date} (${weekday}): ${t("home.heatmap.noActivity")}`
  }, [activeTooltip, t])

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* 头部标题与统计及项目切换（位于卡片外部） */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="truncate text-xs font-semibold text-white/90">
            {t("home.heatmap.title")}
          </h3>
          <div className="font-mono text-xs text-white/60">
            <span className="font-semibold text-emerald-400">
              {t("home.heatmap.activities", { count: totalYearActivities })}
            </span>
            {maxCount > 0 && (
              <span className="ml-1.5 text-[10px] text-white/35">(Max: {maxCount}/day)</span>
            )}
          </div>
        </div>

        {projectOptions && onProjectChange && (
          <div className="w-40 sm:w-48 shrink-0">
            <LxSelect
              size="small"
              value={selectedProjectId ?? "all"}
              options={projectOptions}
              onChange={onProjectChange}
            />
          </div>
        )}
      </div>

      {/* 绿墙热力图卡片主体 */}
      <div className="overview-heatmap-card flex min-w-0 flex-col gap-4 rounded-[6px] border border-[#333333] bg-[#1e1e1e] p-4 [contain:layout_paint_style] [transform:translateZ(0)]">
        {/* 绿墙热力图主体：按月流式自适应折行，每行行首自适应展示星期基准标签 */}
        <div
          ref={containerRef}
          className="relative flex flex-wrap items-start gap-x-3 gap-y-3.5 min-w-0 w-full"
        >
          {months.map((month) => (
            <MonthBlock
              key={month.monthKey}
              month={month}
              showWeekdayLabels={rowStartMonthKeys.has(month.monthKey)}
              onHover={handleHover}
              onLeave={handleLeave}
            />
          ))}
        </div>

        {/* 底部图例 */}
        <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-white/40 select-none">
          <span>{t("home.heatmap.less")}</span>
          <div className="flex items-center gap-1 px-1">
            <span
              className={`overview-heatmap-cell h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-[2px] ${LEVEL_CLASS_MAP[0]}`}
              data-level="0"
            />
            <span
              className={`overview-heatmap-cell h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-[2px] ${LEVEL_CLASS_MAP[1]}`}
              data-level="1"
            />
            <span
              className={`overview-heatmap-cell h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-[2px] ${LEVEL_CLASS_MAP[2]}`}
              data-level="2"
            />
            <span
              className={`overview-heatmap-cell h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-[2px] ${LEVEL_CLASS_MAP[3]}`}
              data-level="3"
            />
            <span
              className={`overview-heatmap-cell h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-[2px] ${LEVEL_CLASS_MAP[4]}`}
              data-level="4"
            />
          </div>
          <span>{t("home.heatmap.more")}</span>
        </div>
      </div>

      {/* 全局单例 LxTooltip 控制器：挂载至 document.body，彻底切断祖先 contain/transform 局部包含块偏移 */}
      {activeTooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <LxTooltip
            key={activeTooltip.day.date}
            open={true}
            trigger="click"
            placement="top"
            content={tooltipContent}
          >
            <div
              style={{
                position: "fixed",
                left: `${activeTooltip.rect.left}px`,
                top: `${activeTooltip.rect.top}px`,
                width: `${activeTooltip.rect.width}px`,
                height: `${activeTooltip.rect.height}px`,
                pointerEvents: "none",
              }}
            />
          </LxTooltip>,
          document.body,
        )}
    </div>
  )
}
