import { useTranslation } from "@/i18n"
import { useHeaderUsageData } from "../hooks/useHeaderUsageData"
import {
  calcCacheHitRate,
  formatCompact,
  formatPercent,
  formatUsd,
  getFreshInputTokens,
} from "../utils"

// 顶部栏用量面板属性。
export interface HeaderUsagePanelProps {
  // 顶部栏展开状态：收起时不请求，展开时按当前时间拉取一次今日数据。
  isExpanded: boolean
}

/**
 * 渲染顶部栏右侧"今日用量"面板：主指标、逐小时分布柱、从属指标条与缓存命中率进度，不实时刷新。
 */
export const HeaderUsagePanel = ({ isExpanded }: HeaderUsagePanelProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { summary, hourly, hasError } = useHeaderUsageData(isExpanded)

  // 首次加载完成前统一显示占位符，避免零值误导为"今日无调用"。
  const formatTokens = (value: number): string => (summary ? formatCompact(value) : "--")
  const cacheHitRate = summary
    ? calcCacheHitRate(summary.inputTokens, summary.cacheReadTokens)
    : null
  // 小时柱统一按最大小时总量归一化；全零时不绘制柱体。
  const barMax = hourly.reduce(
    (max, point) => Math.max(max, point.inputTokens + point.outputTokens),
    0,
  )
  const secondaryStats: { label: string; value: string; color: string }[] = [
    {
      label: t("usage.summary.requests"),
      value: formatTokens(summary?.requestCount ?? 0),
      color: "var(--color-usage-chart-requests)",
    },
    {
      label: t("usage.tokens.freshInput"),
      value: formatTokens(summary ? getFreshInputTokens(summary) : 0),
      color: "var(--color-usage-chart-fresh-input)",
    },
    {
      label: t("usage.summary.outputTokens"),
      value: formatTokens(summary?.outputTokens ?? 0),
      color: "var(--color-usage-chart-output)",
    },
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
          <div className="flex min-h-0 flex-[2.6] items-center justify-between gap-3 pb-2">
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

          {/* 今日逐小时分布：按 token 构成叠加的纯 CSS 柱 */}
          <div className="flex min-h-0 flex-[1.6] items-end gap-px border-b border-[var(--color-theme-border)]">
            {barMax > 0
              ? hourly.map((point) => {
                  const segments = [
                    {
                      key: "freshInput",
                      value: getFreshInputTokens(point),
                      color: "var(--color-usage-chart-fresh-input)",
                    },
                    {
                      key: "cacheRead",
                      value: point.cacheReadTokens,
                      color: "var(--color-usage-chart-cache-read)",
                    },
                    {
                      key: "cacheWrite",
                      value: point.cacheWriteTokens,
                      color: "var(--color-usage-chart-cache-write)",
                    },
                    {
                      key: "output",
                      value: point.outputTokens,
                      color: "var(--color-usage-chart-output)",
                    },
                  ]
                  return (
                    <div
                      key={point.date}
                      className="header-usage-bar flex h-full min-h-0 min-w-0 flex-1 flex-col-reverse"
                    >
                      {segments.map((segment) => (
                        <div
                          key={segment.key}
                          className="w-full shrink-0"
                          style={{
                            height: `${(segment.value / barMax) * 100}%`,
                            minHeight: segment.value > 0 ? "1px" : "0",
                            backgroundColor: segment.color,
                          }}
                        />
                      ))}
                    </div>
                  )
                })
              : null}
          </div>

          {/* 从属指标条：请求数、新增输入、输出三列无框，列间竖分隔线 */}
          <div className="grid min-h-0 flex-[1.6] grid-cols-3 divide-x divide-[var(--color-theme-border)] border-b border-[var(--color-theme-border)]">
            {secondaryStats.map((stat) => (
              <div
                key={stat.label}
                className="flex min-w-0 flex-col justify-center gap-1 px-3 first:pl-0"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--color-theme-text-muted)]">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: stat.color }}
                  />
                  <span className="truncate">{stat.label}</span>
                </span>
                <span className="text-[15px] font-medium text-[var(--color-theme-text)]">
                  {stat.value}
                </span>
              </div>
            ))}
          </div>

          {/* 缓存命中率：百分比与进度条 */}
          <div className="flex min-h-0 flex-[1.2] flex-col justify-center gap-1.5 pt-2">
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
