import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useTranslation } from "@/i18n"
import { USAGE_CHART_COLORS } from "../constants"
import type { UsageDailyPoint } from "../types"
import { fillDailySeries, formatCompact, formatNumber } from "../utils"
import { UsageChartCard } from "./UsageChartCard"
import { UsageChartTooltip, type UsageChartTooltipEntry } from "./UsageChartTooltip"

export interface UsageRequestsChartProps {
  daily: UsageDailyPoint[]
  startTime?: number
  endTime?: number
}

/**
 * 每日请求数柱状图。
 */
export const UsageRequestsChart = ({
  daily,
  startTime,
  endTime,
}: UsageRequestsChartProps): React.JSX.Element => {
  const { t } = useTranslation()

  const series = useMemo(
    () => fillDailySeries(daily, startTime, endTime),
    [daily, startTime, endTime],
  )
  const data = useMemo(
    () => series.map((point) => ({ label: point.date.slice(5), requests: point.requestCount })),
    [series],
  )
  const hasData = series.some((point) => point.requestCount > 0)

  const formatTooltipValue = (entry: UsageChartTooltipEntry): string =>
    formatNumber(Number(entry.value ?? 0))

  return (
    <UsageChartCard
      title={t("usage.charts.requests")}
      isEmpty={!hasData}
      emptyText={t("usage.empty.noData")}
      height={260}
    >
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            accessibilityLayer={false}
            data={data}
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
              tick={{ fill: "var(--color-theme-text-muted)", fontSize: 10 }}
            />
            <YAxis
              width={40}
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-theme-text-muted)", fontSize: 10 }}
              tickFormatter={(value: number) => formatCompact(value)}
            />
            <Tooltip
              content={<UsageChartTooltip valueFormatter={formatTooltipValue} />}
              cursor={{ fill: "var(--color-theme-border)", fillOpacity: 0.35 }}
            />
            <Bar
              dataKey="requests"
              name={t("usage.summary.requests")}
              fill={USAGE_CHART_COLORS.requests}
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </UsageChartCard>
  )
}
