import { useTranslation } from "@/i18n"
import type { UsageSummary } from "../types"
import { formatCompact, formatDuration, formatNumber, formatPercent, formatUsd } from "../utils"

export interface UsageSummaryCardsProps {
  summary: UsageSummary | null
}

/**
 * 用量汇总卡：请求数、总 Tokens、总成本与平均耗时。
 */
export const UsageSummaryCards = ({ summary }: UsageSummaryCardsProps): React.JSX.Element => {
  const { t } = useTranslation()

  const cards: { title: string; value: string; detail: string }[] = [
    {
      title: t("usage.summary.requests"),
      value: formatNumber(summary?.requestCount ?? 0),
      detail: `${t("usage.summary.successRate")} ${formatPercent(summary?.successRate ?? 0)}`,
    },
    {
      title: t("usage.summary.totalTokens"),
      value: formatCompact(summary?.totalTokens ?? 0),
      detail: `${t("usage.summary.inputTokens")} ${formatCompact(summary?.inputTokens ?? 0)} · ${t("usage.summary.outputTokens")} ${formatCompact(summary?.outputTokens ?? 0)}`,
    },
    {
      title: t("usage.summary.totalCost"),
      value: summary && summary.pricedRequestCount > 0 ? formatUsd(summary.totalCostUsd) : "--",
      detail:
        summary && summary.pricedRequestCount > 0
          ? `${summary.pricedRequestCount}/${summary.requestCount} ${t("usage.summary.pricedRequests")}`
          : t("usage.summary.noPricing"),
    },
    {
      title: t("usage.summary.avgDuration"),
      value: formatDuration(summary?.avgDurationMs ?? null),
      detail: `${t("usage.summary.cacheReadTokens")} ${formatCompact(summary?.cacheReadTokens ?? 0)} · ${t("usage.summary.cacheWriteTokens")} ${formatCompact(summary?.cacheWriteTokens ?? 0)}`,
    },
  ]

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="flex min-w-0 flex-col gap-1 rounded-[6px] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-3"
        >
          <span className="truncate text-[11px] text-[var(--color-theme-text-muted)]">
            {card.title}
          </span>
          <span className="truncate text-base font-semibold text-[var(--color-theme-text)]">
            {card.value}
          </span>
          <span className="truncate text-[11px] text-[var(--color-theme-text-subtle)]">
            {card.detail}
          </span>
        </div>
      ))}
    </div>
  )
}
