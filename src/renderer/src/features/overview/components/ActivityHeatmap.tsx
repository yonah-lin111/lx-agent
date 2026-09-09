import React, { useMemo } from "react"
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
  4: "bg-emerald-400 border border-emerald-300 hover:brightness-110 shadow-xs shadow-emerald-500/25",
}

const WEEKDAY_SHORT_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

interface HeatmapDayCellProps {
  day: HeatmapCell | null
  tooltipText?: string
}

/**
 * 单个热力图方格单元（使用 React.memo 彻底阻断父级重组时的级联重绘，消除卡顿）。
 * 统一使用项目 LxTooltip 组件显示提示。
 */
const HeatmapDayCell = React.memo(
  ({ day, tooltipText }: HeatmapDayCellProps): React.JSX.Element => {
    if (!day) {
      return (
        <div className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 rounded-[2px] bg-transparent opacity-0 pointer-events-none" />
      )
    }

    return (
      <LxTooltip content={tooltipText} placement="top" delay={50}>
        <div
          tabIndex={0}
          data-date={day.date}
          data-count={day.count}
          data-level={day.level}
          className={`overview-heatmap-cell h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 cursor-pointer rounded-[2px] transition-colors duration-75 ${LEVEL_CLASS_MAP[day.level]}`}
        />
      </LxTooltip>
    )
  },
)

HeatmapDayCell.displayName = "HeatmapDayCell"

interface MonthBlockProps {
  month: HeatmapMonth
  t: (key: string, options?: Record<string, unknown>) => string
}

/**
 * 单个月份独立周列网格（使用 React.memo，宽度足够时单行平铺，不足时按月逐月自适应折行）。
 */
const MonthBlock = React.memo(({ month, t }: MonthBlockProps): React.JSX.Element => {
  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      {/* 月份名称 */}
      <div className="h-4 text-[11px] font-medium leading-none text-white/50 select-none">
        {month.label}
      </div>

      {/* 该月份的所有周列 */}
      <div className="flex gap-1">
        {month.weeks.map((week) => (
          <div key={week.weekIndex} className="flex flex-col gap-1 shrink-0">
            {week.days.map((day, dayIndex) => {
              if (!day) {
                return <HeatmapDayCell key={`empty-${dayIndex}`} day={null} />
              }

              const dateObj = new Date(`${day.date}T00:00:00`)
              const weekday = WEEKDAY_SHORT_NAMES[dateObj.getDay()]
              const tooltipText =
                day.count > 0
                  ? `${day.date} (${weekday}): ${t("home.heatmap.activitiesDetail", {
                      count: day.count,
                      turns: day.turns,
                      toolCalls: day.toolCalls,
                    })}`
                  : `${day.date} (${weekday}): ${t("home.heatmap.noActivity")}`

              return <HeatmapDayCell key={day.date} day={day} tooltipText={tooltipText} />
            })}
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
 * 2. 统一使用项目 LxTooltip 组件，并通过 React.memo 细粒度记忆化消除渲染卡顿；
 * 3. 严格对齐 Mon..Sun 7 天垂直基线，单元格放大至 14px。
 */
export const ActivityHeatmap = ({ entries }: ActivityHeatmapProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { months, maxCount } = useMemo(() => buildHeatmapMonths(entries), [entries])

  const totalYearActivities = useMemo(
    () => entries.reduce((acc, curr) => acc + curr.count, 0),
    [entries],
  )

  const dayLabels = ["Mon", "", "Wed", "", "Fri", "", ""]

  return (
    <div className="overview-heatmap-card flex min-w-0 flex-col gap-4 rounded-[6px] border border-white/5 bg-[#262626] p-4">
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
            <MonthBlock key={month.monthKey} month={month} t={t} />
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
    </div>
  )
}
