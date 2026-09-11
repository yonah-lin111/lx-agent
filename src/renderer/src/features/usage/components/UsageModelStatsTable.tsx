import { useTranslation } from "@/i18n"
import type { UsageModelStats } from "../types"
import { formatNumber, formatUsd } from "../utils"

export interface UsageModelStatsTableProps {
  modelStats: UsageModelStats[]
}

/**
 * 模型统计表：按模型聚合请求数、token 与成本。
 */
export const UsageModelStatsTable = ({
  modelStats,
}: UsageModelStatsTableProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="overflow-hidden rounded-[6px] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)]">
      <div className="custom-scrollbar overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-[var(--color-theme-border)] text-left text-[var(--color-theme-text-muted)]">
              <th className="px-3 py-2 font-medium">{t("usage.columns.model")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("usage.columns.requests")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("usage.columns.input")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("usage.columns.output")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("usage.columns.cacheRead")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("usage.columns.cacheWrite")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("usage.columns.totalTokens")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("usage.columns.cost")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("usage.columns.avgCost")}</th>
            </tr>
          </thead>
          <tbody className="text-[var(--color-theme-text)]">
            {modelStats.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-[var(--color-theme-text-muted)]"
                >
                  {t("usage.empty.noData")}
                </td>
              </tr>
            ) : (
              modelStats.map((stat) => (
                <tr
                  key={stat.model}
                  className="border-b border-[var(--color-theme-border)] last:border-b-0 hover:bg-white/[0.02]"
                >
                  <td className="max-w-[220px] truncate px-3 py-2">{stat.model}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(stat.requestCount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(stat.inputTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(stat.outputTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(stat.cacheReadTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(stat.cacheWriteTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(stat.totalTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatUsd(stat.totalCostUsd)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatUsd(stat.avgCostPerRequestUsd)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
