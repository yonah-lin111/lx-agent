import React, { useCallback, useEffect, useMemo, useState } from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import type { ActivityDayEntry, HeatmapCell, HeatmapMonth } from "../types"
import { buildHeatmapMonths } from "../utils"

// 活动热力图属性。
export interface ActivityHeatmapProps {
  entries: ActivityDayEntry[]
}

const LEVEL_CLASS_MAP: Record<HeatmapCell["level"], string> = {
  0: "bg-white/5 border border-white/5 hover:border-white/20",
  1: "bg-emerald-500/20 border border-emerald-500/30 hover:border-emerald-400",
  2: "bg-emerald-500/45 border border-emerald-500/50 hover:border-emerald-400",
  3: "bg-emerald-500/75 border border-emerald-400 hover:border-emerald-300",
  4: "bg-emerald-400 border border-emerald-300 hover:brightness-110 hover:shadow-xs hover:shadow-emerald-500/25",
}

const WEEKDAY_SHORT_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

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
        <div className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 rounded-[2px] bg-transparent opacity-0 pointer-events-none" />
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
  onHover: (day: HeatmapCell, rect: DOMRect) => void
  onLeave: () => void
}

/**
 * 单个月份独立周列网格（使用 contain:layout_paint 与 will-change:transform 进行 GPU 合成隔离，避免重排下钻）。
 */
const MonthBlock = React.memo(({ month, onHover, onLeave }: MonthBlockProps): React.JSX.Element => {
  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0 [contain:layout_paint] [will-change:transform]">
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
  )
})

MonthBlock.displayName = "MonthBlock"

/**
 * 渲染生产力绿墙热力图：
 * 1. 宽度足够时全月单行平铺，宽度不足时逐月自适应折行，杜绝横向滚动条；
 * 2. 统一使用项目标准 LxTooltip 组件，以单例控制器挂载，彻底清除 9,400+ 个 Hook 造成的渲染颠簸；
 * 3. 严格对齐 Mon..Sun 7 天垂直基线，单元格放大至 14px。
 */
export const ActivityHeatmap = ({ entries }: ActivityHeatmapProps): React.JSX.Element => {
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

  const dayLabels = ["Mon", "", "Wed", "", "Fri", "", ""]

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
    <div className="overview-heatmap-card flex min-w-0 flex-col gap-4 rounded-[6px] border border-white/5 bg-[#262626] p-4 [contain:layout_paint_style] [transform:translateZ(0)]">
      {/* 头部标题与统计 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white/90">
            {t("home.heatmap.title")}
          </h3>
          <p className="truncate text-xs text-white/45">{t("home.heatmap.subtitle")}</p>
        </div>
        <div className="shrink-0 font-mono text-xs text-white/60">
          <span className="font-semibold text-emerald-400">
            {t("home.heatmap.activities", { count: totalYearActivities })}
          </span>
          {maxCount > 0 && (
            <span className="ml-2 text-[10px] text-white/35">(Max: {maxCount}/day)</span>
          )}
        </div>
      </div>

      {/* 绿墙热力图主体：按月流式自适应折行 */}
      <div className="flex items-start gap-2 min-w-0 w-full">
        {/* 左侧星期标签（与下方第一天基线对齐） */}
        <div className="flex flex-col gap-1 pr-1 text-[9px] text-white/35 select-none shrink-0 pt-[22px]">
          {dayLabels.map((label, idx) => (
            <div key={idx} className="flex h-3 w-5 items-center leading-none sm:h-3.5 sm:w-6">
              {label}
            </div>
          ))}
        </div>

        {/* 12 个月度自适应卡片容器：宽度够不折行，宽度不足逐月换行 */}
        <div className="flex flex-wrap items-start gap-x-3 gap-y-3.5 min-w-0 flex-1">
          {months.map((month) => (
            <MonthBlock
              key={month.monthKey}
              month={month}
              onHover={handleHover}
              onLeave={handleLeave}
            />
          ))}
        </div>
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

      {/* 全局单例 LxTooltip 控制器：统一使用项目标准组件，零常驻开销 */}
      {activeTooltip && (
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
        </LxTooltip>
      )}
    </div>
  )
}
