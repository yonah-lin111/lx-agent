import { useMemo } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useTranslation } from "@/i18n"
import { USAGE_CHART_COLORS } from "../constants"
import type { UsageDailyPoint, UsageGranularity } from "../types"
import {
  fillUsageSeries,
  formatBucketLabel,
  formatCompact,
  formatNumber,
  formatUsd,
  getFreshInputTokens,
} from "../utils"
import { UsageChartCard } from "./UsageChartCard"
import { UsageChartTooltip, type UsageChartTooltipEntry } from "./UsageChartTooltip"

export interface UsageTrendChartProps {
  daily: UsageDailyPoint[]
  granularity: UsageGranularity
  startTime?: number
  endTime?: number
}

/**
 * Token（堆叠：新鲜输入 / 输出 / 缓存读 / 缓存写）+ 成本折线趋势图（today 按小时，其余按天）。
 */
export const UsageTrendChart = ({
  daily,
  granularity,
  startTime,
  endTime,
}: UsageTrendChartProps): React.JSX.Element => {
  const { t } = useTranslation()

  const series = useMemo(
    () => fillUsageSeries(daily, granularity, startTime, endTime),
    [daily, granularity, startTime, endTime],
  )
  const data = useMemo(
    () =>
      series.map((point) => ({
        label: formatBucketLabel(point.date, granularity),
        freshInput: getFreshInputTokens(point),
        output: point.outputTokens,
        cacheRead: point.cacheReadTokens,
        cacheWrite: point.cacheWriteTokens,
        cost: point.totalCostUsd,
      })),
    [series],
  )
  const hasData = series.some((point) => point.requestCount > 0)

  const formatTooltipValue = (entry: UsageChartTooltipEntry): string =>
    entry.dataKey === "cost"
      ? formatUsd(Number(entry.value ?? 0))
      : formatNumber(Number(entry.value ?? 0))

  return (
    <UsageChartCard
      title={t("usage.charts.trend")}
      isEmpty={!hasData}
      emptyText={t("usage.empty.noData")}
      height={260}
    >
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            accessibilityLayer={false}
            data={data}
            margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="usageFreshInput" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={USAGE_CHART_COLORS.freshInput} stopOpacity={0.25} />
                <stop offset="95%" stopColor={USAGE_CHART_COLORS.freshInput} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="usageOutput" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={USAGE_CHART_COLORS.output} stopOpacity={0.25} />
                <stop offset="95%" stopColor={USAGE_CHART_COLORS.output} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="usageCacheRead" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={USAGE_CHART_COLORS.cacheRead} stopOpacity={0.25} />
                <stop offset="95%" stopColor={USAGE_CHART_COLORS.cacheRead} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="usageCacheWrite" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={USAGE_CHART_COLORS.cacheWrite} stopOpacity={0.25} />
                <stop offset="95%" stopColor={USAGE_CHART_COLORS.cacheWrite} stopOpacity={0} />
              </linearGradient>
            </defs>
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
              yAxisId="tokens"
              width={44}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-theme-text-muted)", fontSize: 10 }}
              tickFormatter={(value: number) => formatCompact(value)}
            />
            <YAxis
              yAxisId="cost"
              orientation="right"
              width={56}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-theme-text-muted)", fontSize: 10 }}
              tickFormatter={(value: number) => formatUsd(value, 2)}
            />
            <Tooltip
              content={<UsageChartTooltip valueFormatter={formatTooltipValue} />}
              cursor={{ stroke: "var(--color-theme-border-strong)", strokeDasharray: "3 3" }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area
              yAxisId="tokens"
              type="monotone"
              dataKey="freshInput"
              stackId="tokens"
              name={t("usage.tokens.freshInput")}
              stroke={USAGE_CHART_COLORS.freshInput}
              fill="url(#usageFreshInput)"
              strokeWidth={2}
            />
            <Area
              yAxisId="tokens"
              type="monotone"
              dataKey="cacheRead"
              stackId="tokens"
              name={t("usage.summary.cacheReadTokens")}
              stroke={USAGE_CHART_COLORS.cacheRead}
              fill="url(#usageCacheRead)"
              strokeWidth={2}
            />
            <Area
              yAxisId="tokens"
              type="monotone"
              dataKey="cacheWrite"
              stackId="tokens"
              name={t("usage.summary.cacheWriteTokens")}
              stroke={USAGE_CHART_COLORS.cacheWrite}
              fill="url(#usageCacheWrite)"
              strokeWidth={2}
            />
            <Area
              yAxisId="tokens"
              type="monotone"
              dataKey="output"
              stackId="tokens"
              name={t("usage.summary.outputTokens")}
              stroke={USAGE_CHART_COLORS.output}
              fill="url(#usageOutput)"
              strokeWidth={2}
            />
            <Line
              yAxisId="cost"
              type="monotone"
              dataKey="cost"
              name={t("usage.summary.totalCost")}
              stroke={USAGE_CHART_COLORS.cost}
              strokeDasharray="4 4"
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </UsageChartCard>
  )
}
