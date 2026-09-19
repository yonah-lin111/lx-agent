import { useTranslation } from "@/i18n"
import { useTodayUsageSummary } from "../hooks/useTodayUsageSummary"
import {
  calcCacheHitRate,
  formatCompact,
  formatPercent,
  formatUsd,
  getFreshInputTokens,
} from "../utils"

// 顶部栏用量面板属性。
export interface HeaderUsagePanelProps {
  // 顶部栏展开状态：收起时不请求，展开时按当前时间拉取一次今日汇总。
  isExpanded: boolean
}

/**
 * 渲染顶部栏右侧"今日用量"面板：今日汇总六项指标，展开时加载，不实时刷新。
 */
export const HeaderUsagePanel = ({ isExpanded }: HeaderUsagePanelProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { summary, hasError } = useTodayUsageSummary(isExpanded)

  // 首次加载完成前统一显示占位符，避免零值误导为"今日无调用"。
  const formatTokens = (value: number): string => (summary ? formatCompact(value) : "--")
  const cacheHitRate = summary
    ? calcCacheHitRate(summary.inputTokens, summary.cacheReadTokens)
    : null
  const stats: { label: string; value: string }[] = [
    { label: t("usage.summary.requests"), value: formatTokens(summary?.requestCount ?? 0) },
    { label: t("usage.summary.realTotalTokens"), value: formatTokens(summary?.totalTokens ?? 0) },
    {
      label: t("usage.tokens.freshInput"),
      value: formatTokens(summary ? getFreshInputTokens(summary) : 0),
    },
    { label: t("usage.summary.outputTokens"), value: formatTokens(summary?.outputTokens ?? 0) },
    {
      label: t("usage.summary.cacheHitRate"),
      value: cacheHitRate === null ? "--" : formatPercent(cacheHitRate),
    },
    { label: t("usage.summary.totalCost"), value: formatUsd(summary?.totalCostUsd) },
  ]

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <div className="flex h-6 shrink-0 items-center">
        <span className="truncate font-mono text-xs text-[var(--color-theme-text-muted)]">
          {t("usage.headerPanel.title")}
        </span>
      </div>
      {hasError ? (
        <p className="px-1 py-2 text-xs text-[var(--color-theme-text-subtle)]">
          {t("usage.headerPanel.loadFailed")}
        </p>
      ) : (
        <div className="grid min-h-0 w-full grid-cols-2 gap-1.5">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="header-usage-stat flex min-w-0 items-center justify-between gap-2 rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface-hover)] px-2 py-1.5"
            >
              <span className="truncate text-[11px] text-[var(--color-theme-text-muted)]">
                {stat.label}
              </span>
              <span className="shrink-0 text-[13px] font-medium text-[var(--color-theme-text)]">
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
