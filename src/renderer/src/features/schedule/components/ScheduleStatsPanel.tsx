import type { ScheduleDayStats, ScheduleItem } from "@shared/contracts/schedule"
import { PanelRightClose } from "lucide-react"
import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { LxChartCard } from "@/components/ui/LxChartCard"
import { LxChartTooltip } from "@/components/ui/LxChartTooltip"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useTranslation } from "@/i18n"
import { formatDayOfMonth } from "@/lib/date"
import { useAppThemeValue } from "@/stores/themeStore"
import {
  SCHEDULE_CHART_COLORS,
  SCHEDULE_PRIORITY_COLORS,
  SCHEDULE_PRIORITY_SEQUENCE,
  SCHEDULE_TREND_DAYS,
} from "../constants"
import { countByPriority, fillRecentStats, getCompletionRate } from "../utils"

// 完成率环形图高度。
const DONUT_HEIGHT = 104

// 优先级分布内容高度。
const PRIORITY_HEIGHT = 72

// 趋势图高度。
const TREND_HEIGHT = 170

// 图表面板属性。
export interface ScheduleStatsPanelProps {
  // 当日条目（用于完成率与优先级分布）。
  items: ScheduleItem[]
  // 区间统计原始数据（趋势按最近 N 天补齐）。
  trendStats: ScheduleDayStats[]
  // 趋势区间终点（当前查看日期）。
  trendEndDate: string
  // 折叠关闭回调。
  onClose?: () => void
}

/**
 * 日程统计面板：完成率环形图、优先级分布与近 7 日趋势，卡片与图表样式对齐用量统计。
 */
export const ScheduleStatsPanel = ({
  items,
  trendStats,
  trendEndDate,
  onClose,
}: ScheduleStatsPanelProps): React.JSX.Element => {
  const { t } = useTranslation()
  const theme = useAppThemeValue()
  // Minecraft 像素主题用直角柱形，其余主题保留顶部圆角。
  const barRadius: [number, number, number, number] =
    theme === "minecraft" ? [0, 0, 0, 0] : [3, 3, 0, 0]

  const completedCount = items.filter((item) => item.completed).length
  const pendingCount = items.length - completedCount
  const completionRate = getCompletionRate(items)
  const priorityCounts = useMemo(() => countByPriority(items), [items])
  const trendPoints = useMemo(
    () =>
      fillRecentStats(trendStats, trendEndDate, SCHEDULE_TREND_DAYS).map((point) => ({
        label: formatDayOfMonth(point.date),
        plannedCount: point.plannedCount,
        completedCount: point.completedCount,
      })),
    [trendStats, trendEndDate],
  )
  const hasTrendData = trendPoints.some(
    (point) => point.plannedCount > 0 || point.completedCount > 0,
  )

  // 完成率切片：待完成复用趋势"计划"色，保持"蓝=未完成 / 绿=完成"的语义一致。
  const completionSlices = [
    {
      name: t("schedule.stats.completed"),
      value: completedCount,
      color: SCHEDULE_CHART_COLORS.completed,
    },
    {
      name: t("schedule.stats.pending"),
      value: pendingCount,
      color: SCHEDULE_CHART_COLORS.planned,
    },
  ].filter((slice) => slice.value > 0)

  return (
    <aside className="lx-schedule-stats flex w-full shrink-0 flex-col gap-3 xl:w-[300px]">
      {onClose ? (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-[var(--color-theme-text-muted)]">
            {t("schedule.toggleStats")}
          </span>
          <LxIconButton
            size="small"
            aria-label={t("schedule.hideStats")}
            title={{ content: t("schedule.hideStats"), placement: "left" }}
            onClick={onClose}
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </LxIconButton>
        </div>
      ) : null}

      {/* 完成率环形图 */}

      <LxChartCard
        title={t("schedule.stats.completionTitle")}
        isEmpty={completionSlices.length === 0}
        emptyText={t("schedule.stats.empty")}
        height={DONUT_HEIGHT + 24}
      >
        <div>
          <div className="relative" style={{ height: DONUT_HEIGHT }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart accessibilityLayer={false}>
                <Tooltip content={<LxChartTooltip />} />
                <Pie
                  data={completionSlices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="64%"
                  outerRadius="96%"
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {completionSlices.map((slice) => (
                    <Cell key={slice.name} fill={slice.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-xl font-bold text-[var(--color-theme-text)]">
                {completedCount}/{items.length}
              </span>
              <span className="text-xs text-[var(--color-theme-text-muted)]">
                {completionRate}%
              </span>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-3 text-xs">
            {completionSlices.map((slice) => (
              <span
                key={slice.name}
                className="flex items-center gap-1.5 text-[var(--color-theme-text-muted)]"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.color }}
                />
                {slice.name}
                <span className="text-[var(--color-theme-text)]">{slice.value}</span>
              </span>
            ))}
          </div>
        </div>
      </LxChartCard>

      {/* 优先级分布 */}
      <LxChartCard
        title={t("schedule.stats.priorityTitle")}
        isEmpty={items.length === 0}
        emptyText={t("schedule.stats.empty")}
        height={PRIORITY_HEIGHT}
      >
        <div>
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-[4px] bg-[var(--color-theme-surface-hover)]"
            style={{ height: PRIORITY_HEIGHT - 36 }}
          >
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
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {SCHEDULE_PRIORITY_SEQUENCE.map((priority) => (
              <li
                key={priority}
                className="flex items-center gap-1.5 text-xs text-[var(--color-theme-text-muted)]"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: SCHEDULE_PRIORITY_COLORS[priority] }}
                />
                <span>{priority}</span>
                <span className="ml-auto font-mono text-[var(--color-theme-text)]">
                  {priorityCounts[priority]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </LxChartCard>

      {/* 近 7 日趋势 */}
      <LxChartCard
        title={t("schedule.stats.trendTitle")}
        isEmpty={!hasTrendData}
        emptyText={t("schedule.stats.empty")}
        height={TREND_HEIGHT}
      >
        <div style={{ height: TREND_HEIGHT }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              accessibilityLayer={false}
              data={trendPoints}
              margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--color-theme-border)"
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--color-theme-text-muted)", fontSize: 12 }}
              />
              <YAxis
                width={28}
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--color-theme-text-muted)", fontSize: 12 }}
              />
              <Tooltip
                content={<LxChartTooltip />}
                cursor={{ fill: "var(--color-theme-border)", fillOpacity: 0.35 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="plannedCount"
                name={t("schedule.stats.planned")}
                fill={SCHEDULE_CHART_COLORS.planned}
                radius={barRadius}
                maxBarSize={12}
                isAnimationActive={false}
              />
              <Bar
                dataKey="completedCount"
                name={t("schedule.stats.completed")}
                fill={SCHEDULE_CHART_COLORS.completed}
                radius={barRadius}
                maxBarSize={12}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </LxChartCard>
    </aside>
  )
}
