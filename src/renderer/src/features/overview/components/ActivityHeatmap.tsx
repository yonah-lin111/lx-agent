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
  1: "bg-emerald-950/90 border border-emerald-800/50 hover:border-emerald-600",
  2: "bg-emerald-800/70 border border-emerald-600/50 hover:border-emerald-500",
  3: "bg-emerald-600/80 border border-emerald-500/60 hover:border-emerald-400",
  4: "bg-emerald-500 border border-emerald-400/90 hover:brightness-110",
}

/**
 * 渲染生产力绿墙热力图（对齐 GitHub 52 周网格，严禁使用原生 title，统一使用 LxTooltip）。
 */
export const ActivityHeatmap = ({ entries }: ActivityHeatmapProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { weeks, monthLabels } = useMemo(() => buildHeatmapWeeks(entries), [entries])

  const totalYearActivities = useMemo(
    () => entries.reduce((acc, curr) => acc + curr.count, 0),
    [entries],
  )

  const dayLabels = ["Mon", "", "Wed", "", "Fri", "", ""]

  return (
    <div className="flex flex-col gap-3 rounded-[6px] border border-white/5 bg-[#262626] p-4">
      {/* 头部标题与统计 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white/90">{t("home.heatmap.title")}</h3>
          <p className="text-xs text-white/45">{t("home.heatmap.subtitle")}</p>
        </div>
        <div className="font-mono text-xs text-white/60">
          <span className="font-semibold text-emerald-400">{totalYearActivities}</span>{" "}
          {t("home.heatmap.activities", { count: totalYearActivities })}
        </div>
      </div>

      {/* 热力图网格滚动容器 */}
      <div className="custom-scrollbar overflow-x-auto pb-1 [scrollbar-gutter:stable]">
        <div className="inline-flex flex-col gap-1 min-w-full">
          {/* 月份表头 */}
          <div className="flex h-4 items-center pl-7 text-[10px] text-white/40">
            {monthLabels.map((m, idx) => {
              const nextWeekIndex = monthLabels[idx + 1]?.weekIndex ?? weeks.length
              const spanWeeks = nextWeekIndex - m.weekIndex
              if (spanWeeks < 2) return null
              return (
                <div
                  key={`${m.label}-${m.weekIndex}`}
                  style={{ width: `${spanWeeks * 14}px` }}
                  className="shrink-0 truncate"
                >
                  {m.label}
                </div>
              )
            })}
          </div>

          {/* 核心网格：左侧星期 + 右侧 52 周列 */}
          <div className="flex gap-1.5 items-center">
            {/* 星期标签列 */}
            <div className="flex flex-col gap-1 text-[9px] text-white/35 pr-1 select-none">
              {dayLabels.map((label, idx) => (
                <div key={idx} className="h-2.5 w-6 leading-none flex items-center">
                  {label}
                </div>
              ))}
            </div>

            {/* 周列 */}
            <div className="flex gap-1">
              {weeks.map((week) => (
                <div key={week.weekIndex} className="flex flex-col gap-1">
                  {week.days.map((day, dayIndex) => {
                    if (!day) {
                      return (
                        <div
                          key={`empty-${dayIndex}`}
                          className="h-2.5 w-2.5 rounded-[2px] bg-transparent opacity-0"
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
                          className={`h-2.5 w-2.5 cursor-pointer rounded-[2px] transition-all duration-100 ${LEVEL_CLASS_MAP[day.level]}`}
                        />
                      </LxTooltip>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* 底部图例 */}
          <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-white/40 select-none">
            <span>{t("home.heatmap.less")}</span>
            <div className="flex gap-1 items-center px-1">
              <span className={`h-2.5 w-2.5 rounded-[2px] ${LEVEL_CLASS_MAP[0]}`} />
              <span className={`h-2.5 w-2.5 rounded-[2px] ${LEVEL_CLASS_MAP[1]}`} />
              <span className={`h-2.5 w-2.5 rounded-[2px] ${LEVEL_CLASS_MAP[2]}`} />
              <span className={`h-2.5 w-2.5 rounded-[2px] ${LEVEL_CLASS_MAP[3]}`} />
              <span className={`h-2.5 w-2.5 rounded-[2px] ${LEVEL_CLASS_MAP[4]}`} />
            </div>
            <span>{t("home.heatmap.more")}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
