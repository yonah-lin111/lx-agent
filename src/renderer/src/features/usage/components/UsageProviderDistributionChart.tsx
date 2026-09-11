import { useMemo } from "react"
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { useTranslation } from "@/i18n"
import type { UsageProviderStats } from "../types"
import { formatNumber, formatUsd } from "../utils"
import { UsageChartCard } from "./UsageChartCard"
import { UsageChartTooltip, type UsageChartTooltipEntry } from "./UsageChartTooltip"

const MAX_PROVIDERS = 8
const PROVIDER_COLORS = [
  "#38bdf8",
  "#22c55e",
  "#a855f7",
  "#f97316",
  "#f43f5e",
  "#eab308",
  "#14b8a6",
  "#6366f1",
]

export interface UsageProviderDistributionChartProps {
  providerStats: UsageProviderStats[]
}

/**
 * Provider 分布环形图：配置了计价时按成本展示，否则回落为 Token 用量。
 */
export const UsageProviderDistributionChart = ({
  providerStats,
}: UsageProviderDistributionChartProps): React.JSX.Element => {
  const { t } = useTranslation()

  const hasPricing = providerStats.some((stat) => stat.totalCostUsd !== null)
  const data = useMemo(
    () =>
      providerStats
        .slice(0, MAX_PROVIDERS)
        .map((stat) => ({
          provider: stat.provider,
          cost: stat.totalCostUsd ?? 0,
          tokens: stat.totalTokens,
          totalCost: stat.totalCostUsd,
        })),
    [providerStats],
  )

  const formatTooltipValue = (entry: UsageChartTooltipEntry): string =>
    hasPricing ? formatUsd(Number(entry.value ?? 0)) : formatNumber(Number(entry.value ?? 0))

  return (
    <UsageChartCard
      title={t("usage.charts.providerDistribution")}
      subtitle={hasPricing ? undefined : t("usage.charts.noPricingHint")}
      isEmpty={data.length === 0}
      emptyText={t("usage.empty.noData")}
      height={260}
    >
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<UsageChartTooltip valueFormatter={formatTooltipValue} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Pie
              data={data}
              dataKey={hasPricing ? "cost" : "tokens"}
              nameKey="provider"
              innerRadius={52}
              outerRadius={82}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((item, index) => (
                <Cell key={item.provider} fill={PROVIDER_COLORS[index % PROVIDER_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </UsageChartCard>
  )
}
