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
 * 渲染顶部栏右侧"今日用量"面板：主指标、从属指标条与缓存命中率进度，不实时刷新。
 */
export const HeaderUsagePanel = ({ isExpanded }: HeaderUsagePanelProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { summary, hasError } = useTodayUsageSummary(isExpanded)

  // 首次加载完成前统一显示占位符，避免零值误导为"今日无调用"。
  const formatTokens = (value: number): string => (summary ? formatCompact(value) : "--")
  const cacheHitRate = summary
    ? calcCacheHitRate(summary.inputTokens, summary.cacheReadTokens)
    : null
  const secondaryStats: { label: string; value: string }[] = [
    { label: t("usage.summary.requests"), value: formatTokens(summary?.requestCount ?? 0) },
    {
      label: t("usage.tokens.freshInput"),
      value: formatTokens(summary ? getFreshInputTokens(summary) : 0),
    },
    { label: t("usage.summary.outputTokens"), value: formatTokens(summary?.outputTokens ?? 0) },
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
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 主指标：真实消耗大号数字与总成本次级数字 */}
          <div className="flex min-h-0 flex-[3] items-center justify-between gap-3 border-b border-[var(--color-theme-border)] pb-2">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[11px] text-[var(--color-theme-text-muted)]">
                {t("usage.summary.realTotalTokens")}
              </span>
              <span className="text-2xl font-semibold leading-none text-[var(--color-theme-text)]">
                {formatTokens(summary?.totalTokens ?? 0)}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-[11px] text-[var(--color-theme-text-muted)]">
                {t("usage.summary.totalCost")}
              </span>
              <span className="text-base font-medium leading-none text-[var(--color-theme-text)]">
                {formatUsd(summary?.totalCostUsd)}
              </span>
            </div>
          </div>

          {/* 从属指标条：请求数、新增输入、输出三列无框，列间竖分隔线 */}
          <div className="grid min-h-0 flex-[2] grid-cols-3 divide-x divide-[var(--color-theme-border)] border-b border-[var(--color-theme-border)]">
            {secondaryStats.map((stat) => (
              <div
                key={stat.label}
                className="flex min-w-0 flex-col justify-center gap-1 px-3 first:pl-0"
              >
                <span className="truncate text-[11px] text-[var(--color-theme-text-muted)]">
                  {stat.label}
                </span>
                <span className="text-[15px] font-medium text-[var(--color-theme-text)]">
                  {stat.value}
                </span>
              </div>
            ))}
          </div>

          {/* 缓存命中率：百分比与进度条 */}
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="truncate text-[11px] text-[var(--color-theme-text-muted)]">
                {t("usage.summary.cacheHitRate")}
              </span>
              <span className="text-[13px] font-medium text-[var(--color-theme-text)]">
                {cacheHitRate === null ? "--" : formatPercent(cacheHitRate)}
              </span>
            </div>
            <div className="header-usage-meter h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-theme-surface-hover)]">
              <div
                className="header-usage-meter-fill h-full rounded-full bg-[var(--color-usage-chart-cache-hit)] transition-[width] duration-300 ease-out"
                style={{ width: `${cacheHitRate ?? 0}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
