import { useTranslation } from "@/i18n"
import type { UsageProviderStats } from "../types"
import { formatDuration, formatNumber, formatPercent, formatUsd } from "../utils"

export interface UsageProviderStatsTableProps {
  providerStats: UsageProviderStats[]
}

/**
 * Provider 统计表：按 Provider 聚合请求数、token、成本、成功率与平均耗时。
 */
export const UsageProviderStatsTable = ({
  providerStats,
}: UsageProviderStatsTableProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="overflow-hidden rounded-[6px] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)]">
      <div className="custom-scrollbar overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-[var(--color-theme-border)] text-left text-[var(--color-theme-text-muted)]">
              <th className="px-3 py-2 font-medium">{t("usage.columns.provider")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("usage.columns.requests")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("usage.columns.totalTokens")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("usage.columns.cost")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("usage.columns.successRate")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("usage.columns.avgDuration")}</th>
            </tr>
          </thead>
          <tbody className="text-[var(--color-theme-text)]">
            {providerStats.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-[var(--color-theme-text-muted)]"
                >
                  {t("usage.empty.noData")}
                </td>
              </tr>
            ) : (
              providerStats.map((stat) => (
                <tr
                  key={stat.provider}
                  className="border-b border-[var(--color-theme-border)] last:border-b-0 hover:bg-white/[0.02]"
                >
                  <td className="max-w-[220px] truncate px-3 py-2">{stat.provider}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(stat.requestCount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(stat.totalTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatUsd(stat.totalCostUsd)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPercent(stat.successRate)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatDuration(stat.avgDurationMs)}
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
