import { useTranslation } from "@/i18n"
import type { UsageSummary } from "../types"
import {
  calcCacheHitRate,
  formatCompact,
  formatNumber,
  formatPercent,
  getFreshInputTokens,
} from "../utils"

export interface UsageSummaryCardsProps {
  summary: UsageSummary | null
}

/**
 * 用量汇总卡：真实消耗、新增输入、输出、缓存写入、缓存命中与缓存命中率。
 */
export const UsageSummaryCards = ({ summary }: UsageSummaryCardsProps): React.JSX.Element => {
  const { t } = useTranslation()

  const inputTokens = summary?.inputTokens ?? 0
  const outputTokens = summary?.outputTokens ?? 0
  const cacheReadTokens = summary?.cacheReadTokens ?? 0
  const cacheWriteTokens = summary?.cacheWriteTokens ?? 0
  const requestCount = summary?.requestCount ?? 0
  // input 含缓存读写：新增输入为扣除缓存后的新鲜输入。
  const freshInputTokens = summary ? getFreshInputTokens(summary) : 0
  const cacheHitRate = calcCacheHitRate(inputTokens, cacheReadTokens)
  const avgOutputPerRequest =
    requestCount > 0 ? formatNumber(Math.round(outputTokens / requestCount)) : "--"

  const cards: {
    title: string
    value: string
    detail?: string
    progress?: number | null
  }[] = [
    {
      title: t("usage.summary.realTotalTokens"),
      value: formatCompact(summary?.totalTokens ?? 0),
      detail: `${t("usage.columns.input")} ${formatCompact(inputTokens)} · ${t("usage.columns.output")} ${formatCompact(outputTokens)}`,
    },
    {
      title: t("usage.tokens.freshInput"),
      value: formatCompact(freshInputTokens),
      detail: t("usage.summary.shareOfInput", {
        percent: formatPercent((freshInputTokens / inputTokens) * 100),
      }),
    },
    {
      title: t("usage.summary.outputTokens"),
      value: formatCompact(outputTokens),
      detail: t("usage.summary.avgPerRequest", { value: avgOutputPerRequest }),
    },
    {
      title: t("usage.summary.cacheWriteTokens"),
      value: formatCompact(cacheWriteTokens),
      detail: t("usage.summary.shareOfInput", {
        percent: formatPercent((cacheWriteTokens / inputTokens) * 100),
      }),
    },
    {
      title: t("usage.summary.cacheReadTokens"),
      value: formatCompact(cacheReadTokens),
      detail: t("usage.summary.shareOfInput", {
        percent: formatPercent((cacheReadTokens / inputTokens) * 100),
      }),
    },
    {
      title: t("usage.summary.cacheHitRate"),
      value: cacheHitRate === null ? "--" : formatPercent(cacheHitRate),
      detail: `${t("usage.summary.cacheReadTokens")} ${formatCompact(cacheReadTokens)} · ${t("usage.summary.cacheWriteTokens")} ${formatCompact(cacheWriteTokens)}`,
      progress: cacheHitRate,
    },
  ]

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.title}
          className="usage-stat-card flex min-w-0 flex-col gap-1 rounded-[6px] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-3"
        >
          <span className="truncate text-sm text-[var(--color-theme-text-muted)]">
            {card.title}
          </span>
          <span className="truncate text-lg font-semibold text-[var(--color-theme-text)]">
            {card.value}
          </span>
          {card.progress !== undefined ? (
            <div className="usage-cache-hit-meter mt-0.5 h-1 w-full overflow-hidden rounded-full bg-[var(--color-theme-surface-hover)]">
              <div
                className="usage-cache-hit-meter-fill h-full rounded-full bg-[var(--color-usage-chart-cache-hit)] transition-[width] duration-300 ease-out"
                style={{ width: `${card.progress ?? 0}%` }}
              />
            </div>
          ) : null}
          {card.detail ? (
            <span className="truncate text-xs text-[var(--color-theme-text-subtle)]">
              {card.detail}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
