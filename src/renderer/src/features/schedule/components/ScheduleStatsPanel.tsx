import type { ScheduleDayStats, ScheduleItem } from "@shared/contracts/schedule"
import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useTranslation } from "@/i18n"
import { formatDateLabel, formatDayOfMonth } from "@/lib/date"
import {
  SCHEDULE_CHART_COLORS,
  SCHEDULE_PRIORITY_COLORS,
  SCHEDULE_PRIORITY_SEQUENCE,
  SCHEDULE_TREND_DAYS,
} from "../constants"
import { countByPriority, fillRecentStats, getCompletionRate } from "../utils"

// 图表面板属性。
export interface ScheduleStatsPanelProps {
  // 当日条目（用于完成率与优先级分布）。
  items: ScheduleItem[]
  // 区间统计原始数据（趋势按最近 N 天补齐）。
  trendStats: ScheduleDayStats[]
  // 趋势区间终点（当前查看日期）。
  trendEndDate: string
}

// 趋势图自定义提示框属性。
interface TrendTooltipProps {
  active?: boolean
  label?: string | number
  payload?: Array<{ dataKey?: string | number; value?: number }>
}

/**
 * 趋势图提示框：展示所选日期的计划数与完成数。
 */
const TrendTooltip = ({ active, label, payload }: TrendTooltipProps): React.JSX.Element | null => {
  const { t, locale } = useTranslation()
  if (!active || !payload?.length || typeof label !== "string") return null

  const plannedCount = payload.find((entry) => entry.dataKey === "plannedCount")?.value ?? 0
  const completedCount = payload.find((entry) => entry.dataKey === "completedCount")?.value ?? 0

  return (
    <div className="rounded-[4px] border border-[var(--color-theme-border-strong)] bg-[var(--color-theme-surface)] px-2 py-1.5 text-[11px] shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
      <p className="text-[var(--color-theme-text-muted)]">{formatDateLabel(label, locale)}</p>
      <p className="mt-0.5 text-[var(--color-theme-text)]">
        {t("schedule.stats.planned")}: <span className="font-mono">{plannedCount}</span>
      </p>
      <p className="text-[var(--color-theme-text)]">
        {t("schedule.stats.completed")}: <span className="font-mono">{completedCount}</span>
      </p>
    </div>
  )
}

/**
 * 日程统计面板：完成率环形图、优先级分布条与近 7 日趋势图。
 */
export const ScheduleStatsPanel = ({
  items,
  trendStats,
  trendEndDate,
}: ScheduleStatsPanelProps): React.JSX.Element => {
  const { t } = useTranslation()

  const completedCount = items.filter((item) => item.completed).length
  const pendingCount = items.length - completedCount
  const completionRate = getCompletionRate(items)
  const priorityCounts = useMemo(() => countByPriority(items), [items])
  const trendPoints = useMemo(
    () => fillRecentStats(trendStats, trendEndDate, SCHEDULE_TREND_DAYS),
    [trendStats, trendEndDate],
  )
  const hasTrendData = trendPoints.some(
    (point) => point.plannedCount > 0 || point.completedCount > 0,
  )

  const ringData =
    items.length === 0
      ? [{ name: "empty", value: 1 }]
      : [
          { name: "completed", value: completedCount },
          { name: "pending", value: pendingCount },
        ]

  return (
    <aside className="lx-schedule-stats flex w-full shrink-0 flex-col gap-3 xl:w-[300px]">
      {/* 完成率环形图 */}
      <section className="rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-3">
        <h3 className="text-sm font-semibold text-[var(--color-theme-text)]">
          {t("schedule.stats.completionTitle")}
        </h3>
        <div className="relative mt-2 h-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={ringData}
                dataKey="value"
                innerRadius="72%"
                outerRadius="94%"
                startAngle={90}
                endAngle={-270}
                stroke="none"
                isAnimationActive={false}
              >
                <Cell fill="var(--color-theme-accent)" />
                <Cell fill="var(--color-theme-surface-hover)" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-xl font-bold text-[var(--color-theme-text)]">
              {completedCount}/{items.length}
            </span>
            <span className="text-[11px] text-[var(--color-theme-text-muted)]">
              {completionRate}%
            </span>
          </div>
        </div>
      </section>

      {/* 优先级分布 */}
      <section className="rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-3">
        <h3 className="text-sm font-semibold text-[var(--color-theme-text)]">
          {t("schedule.stats.priorityTitle")}
        </h3>
        {items.length === 0 ? (
          <p className="py-4 text-center text-xs text-[var(--color-theme-text-subtle)]">
            {t("schedule.stats.empty")}
          </p>
        ) : (
          <>
            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-[4px] bg-[var(--color-theme-surface-hover)]">
              {SCHEDULE_PRIORITY_SEQUENCE.map((priority) =>
                priorityCounts[priority] > 0 ? (
                  <span
                    key={priority}
                    className="lx-schedule-priority-segment h-full"
                    style={{
                      width: `${(priorityCounts[priority] / items.length) * 100}%`,
                      backgroundColor: SCHEDULE_PRIORITY_COLORS[priority],
                    }}
                  />
                ) : null,
              )}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {SCHEDULE_PRIORITY_SEQUENCE.map((priority) => (
                <li
                  key={priority}
                  className="flex items-center gap-1.5 text-[11px] text-[var(--color-theme-text-muted)]"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: SCHEDULE_PRIORITY_COLORS[priority] }}
                  />
                  <span>{priority}</span>
                  <span className="ml-auto font-mono text-[var(--color-theme-text)]">
                    {priorityCounts[priority]}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* 近 7 日趋势 */}
      <section className="rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--color-theme-text)]">
            {t("schedule.stats.trendTitle")}
          </h3>
          <div className="flex items-center gap-2 text-[10px] text-[var(--color-theme-text-muted)]">
            <span className="flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: SCHEDULE_CHART_COLORS.planned }}
              />
              {t("schedule.stats.planned")}
            </span>
            <span className="flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: SCHEDULE_CHART_COLORS.completed }}
              />
              {t("schedule.stats.completed")}
            </span>
          </div>
        </div>
        {hasTrendData ? (
          <div className="mt-2 h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={trendPoints}
                barGap={2}
                margin={{ top: 8, right: 0, bottom: 0, left: -20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-theme-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDayOfMonth}
                  tick={{ fill: "var(--color-theme-text-subtle)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "var(--color-theme-text-subtle)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-theme-surface-hover)", opacity: 0.4 }}
                  content={<TrendTooltip />}
                />
                <Bar
                  dataKey="plannedCount"
                  fill={SCHEDULE_CHART_COLORS.planned}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={12}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="completedCount"
                  fill={SCHEDULE_CHART_COLORS.completed}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={12}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-[var(--color-theme-text-subtle)]">
            {t("schedule.stats.empty")}
          </p>
        )}
      </section>
    </aside>
  )
}
