import { useMemo } from "react"
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { LxChartCard } from "@/components/ui/LxChartCard"
import { LxChartTooltip, type LxChartTooltipEntry } from "@/components/ui/LxChartTooltip"
import { useTranslation } from "@/i18n"
import { USAGE_CHART_COLORS } from "../constants"
import type { UsageSummary } from "../types"
import { formatNumber } from "../utils"

// Token 构成固定配色：新鲜输入 / 输出 / 缓存读 / 缓存写（复用主题语义色）。
const COMPOSITION_COLORS = [
  USAGE_CHART_COLORS.freshInput,
  USAGE_CHART_COLORS.output,
  USAGE_CHART_COLORS.cacheRead,
  USAGE_CHART_COLORS.cacheWrite,
]

export interface UsageTokenCompositionChartProps {
  summary: UsageSummary | null
}

/**
 * Token 构成占比图（新鲜输入 / 输出 / 缓存读 / 缓存写）。
 */
export const UsageTokenCompositionChart = ({
  summary,
}: UsageTokenCompositionChartProps): React.JSX.Element => {
  const { t } = useTranslation()

  const data = useMemo(() => {
    if (!summary) return []
    const freshInput = Math.max(
      0,
      summary.inputTokens - summary.cacheReadTokens - summary.cacheWriteTokens,
    )
    return [
      { name: t("usage.tokens.freshInput"), value: freshInput },
      { name: t("usage.summary.outputTokens"), value: summary.outputTokens },
      { name: t("usage.summary.cacheReadTokens"), value: summary.cacheReadTokens },
      { name: t("usage.summary.cacheWriteTokens"), value: summary.cacheWriteTokens },
    ].filter((item) => item.value > 0)
  }, [summary, t])

  const formatTooltipValue = (entry: LxChartTooltipEntry): string =>
    formatNumber(Number(entry.value ?? 0))

  return (
    <LxChartCard
      title={t("usage.charts.tokenComposition")}
      isEmpty={data.length === 0}
      emptyText={t("usage.empty.noData")}
      height={260}
    >
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false}>
            <Tooltip content={<LxChartTooltip valueFormatter={formatTooltipValue} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Pie data={data} dataKey="value" nameKey="name" outerRadius={82} stroke="none">
              {data.map((item, index) => (
                <Cell
                  key={item.name}
                  fill={COMPOSITION_COLORS[index % COMPOSITION_COLORS.length]}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </LxChartCard>
  )
}
