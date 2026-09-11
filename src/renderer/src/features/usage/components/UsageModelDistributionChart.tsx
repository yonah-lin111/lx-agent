import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useTranslation } from "@/i18n"
import { USAGE_CHART_COLORS } from "../constants"
import type { UsageModelStats } from "../types"
import { formatCompact, formatNumber, formatUsd } from "../utils"
import { UsageChartCard } from "./UsageChartCard"
import { UsageChartTooltip, type UsageChartTooltipEntry } from "./UsageChartTooltip"

const MAX_MODELS = 8

export interface UsageModelDistributionChartProps {
  modelStats: UsageModelStats[]
}

/**
 * 模型分布 Top N：配置了计价时按成本展示，否则回落为 Token 用量。
 */
export const UsageModelDistributionChart = ({
  modelStats,
}: UsageModelDistributionChartProps): React.JSX.Element => {
  const { t } = useTranslation()

  const hasPricing = modelStats.some((stat) => stat.totalCostUsd !== null)
  const data = useMemo(
    () =>
      modelStats
        .slice(0, MAX_MODELS)
        .map((stat) => ({
          model: stat.model,
          cost: stat.totalCostUsd,
          tokens: stat.totalTokens,
        }))
        .reverse(),
    [modelStats],
  )

  const formatTooltipValue = (entry: UsageChartTooltipEntry): string =>
    entry.dataKey === "cost"
      ? formatUsd(Number(entry.value ?? 0))
      : formatNumber(Number(entry.value ?? 0))

  return (
    <UsageChartCard
      title={t("usage.charts.modelDistribution")}
      subtitle={hasPricing ? undefined : t("usage.charts.noPricingHint")}
      isEmpty={data.length === 0}
      emptyText={t("usage.empty.noData")}
      height={260}
    >
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="var(--color-theme-border)"
            />
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-theme-text-muted)", fontSize: 10 }}
              tickFormatter={(value: number) => formatCompact(value)}
            />
            <YAxis
              type="category"
              dataKey="model"
              width={120}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-theme-text-muted)", fontSize: 10 }}
              tickFormatter={(value: string) =>
                value.length > 16 ? `${value.slice(0, 16)}…` : value
              }
            />
            <Tooltip content={<UsageChartTooltip valueFormatter={formatTooltipValue} />} />
            <Bar
              dataKey={hasPricing ? "cost" : "tokens"}
              name={hasPricing ? t("usage.summary.totalCost") : t("usage.summary.totalTokens")}
              fill={hasPricing ? USAGE_CHART_COLORS.cost : USAGE_CHART_COLORS.freshInput}
              radius={[0, 3, 3, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </UsageChartCard>
  )
}
