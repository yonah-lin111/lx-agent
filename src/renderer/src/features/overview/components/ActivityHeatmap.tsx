import { useMemo } from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import type { ActivityDayEntry, HeatmapCell } from "../types"
import { buildHeatmapWeeks } from "../utils"

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

interface HeatmapGridTierProps {
  weeks: HeatmapWeek[]
  t: (key: string, options?: Record<string, unknown>) => string
}

/**
 * 渲染单个热力图层级（包含独立左侧星期与顶部月份，单元格放大，严格对齐）。
 */
const HeatmapGridTier = ({ weeks, t }: HeatmapGridTierProps): React.JSX.Element => {
  const dayLabels = ["Mon", "", "Wed", "", "Fri", "", ""]

  return (
    <div className="flex items-start gap-1.5 min-w-0">
      {/* 星期标签列（与周内各天像素级严格对齐） */}
      <div className="flex flex-col gap-1 pr-0.5 text-[9px] text-white/35 select-none shrink-0">
        {/* 顶部月份占位行 */}
        <div className="h-4" />
        {dayLabels.map((label, idx) => (
          <div key={idx} className="flex h-3 w-5 items-center leading-none sm:h-3.5 sm:w-6">
            {label}
          </div>
        ))}
      </div>

      {/* 周列网格（单元格放大至 14px，每列顶部自带月份标签） */}
      <div className="flex gap-1 min-w-0">
        {weeks.map((week) => (
          <div key={week.weekIndex} className="flex flex-col gap-1 shrink-0">
            {/* 月份标签：绑定在对应周列顶部，绝不偏移 */}
            <div className="h-4 text-[10px] leading-none text-white/40 select-none overflow-visible whitespace-nowrap">
              {week.monthLabel || ""}
            </div>

            {/* 7 天单元格 */}
            {week.days.map((day, dayIndex) => {
              if (!day) {
                return (
                  <div
                    key={`empty-${dayIndex}`}
                    className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 rounded-[2px] bg-transparent opacity-0 pointer-events-none"
                  />
                )
              }

              const tooltipText =
                day.count > 0
                  ? `${day.date}: ${t("home.heatmap.activitiesDetail", {
                      count: day.count,
                      turns: day.turns,
                      toolCalls: day.toolCalls,
                    })}`
                  : `${day.date}: ${t("home.heatmap.noActivity")}`

              return (
                <LxTooltip key={day.date} content={tooltipText} placement="top">
                  <div
                    tabIndex={0}
                    data-date={day.date}
                    data-count={day.count}
                    data-level={day.level}
                    className={`overview-heatmap-cell h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 cursor-pointer rounded-[2px] transition-all duration-100 ${LEVEL_CLASS_MAP[day.level]}`}
                  />
                </LxTooltip>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * 渲染生产力绿墙热力图（单元格放大，支持多组自适应换行，彻底杜绝横向滚动条，统一使用 LxTooltip）。
 */
export const ActivityHeatmap = ({ entries }: ActivityHeatmapProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { tiers, maxCount } = useMemo(() => buildHeatmapWeeks(entries), [entries])

  const totalYearActivities = useMemo(
    () => entries.reduce((acc, curr) => acc + curr.count, 0),
    [entries],
  )

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

      {/* 绿墙热力图主体：双组网格自适应折行，零横向滚动条 */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-5 w-full min-w-0">
        {tiers.map((tierWeeks, tierIdx) => (
          <HeatmapGridTier key={tierIdx} weeks={tierWeeks} t={t} />
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
  )
}
