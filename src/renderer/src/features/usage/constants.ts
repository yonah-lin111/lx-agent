// 图表数据配色：引用主题级 CSS 变量（default / minecraft 各自定义），随主题切换自动生效。
export const USAGE_CHART_COLORS = {
  freshInput: "var(--color-usage-chart-fresh-input)",
  output: "var(--color-usage-chart-output)",
  cacheRead: "var(--color-usage-chart-cache-read)",
  cacheWrite: "var(--color-usage-chart-cache-write)",
  cost: "var(--color-usage-chart-cost)",
  requests: "var(--color-usage-chart-requests)",
} as const

// Provider 分布循环色板（最多 8 个）。
export const USAGE_PROVIDER_COLORS = [
  "var(--color-usage-chart-provider-1)",
  "var(--color-usage-chart-provider-2)",
  "var(--color-usage-chart-provider-3)",
  "var(--color-usage-chart-provider-4)",
  "var(--color-usage-chart-provider-5)",
  "var(--color-usage-chart-provider-6)",
  "var(--color-usage-chart-provider-7)",
  "var(--color-usage-chart-provider-8)",
] as const
