import type { ReactNode } from "react"

export interface UsageChartCardProps {
  title: string
  subtitle?: string
  isEmpty: boolean
  emptyText: string
  height?: number
  children: ReactNode
}

/**
 * 图表卡片外壳：标题、副标题与空态占位。
 */
export const UsageChartCard = ({
  title,
  subtitle,
  isEmpty,
  emptyText,
  height = 240,
  children,
}: UsageChartCardProps): React.JSX.Element => (
  <div className="usage-chart-card flex min-w-0 flex-col rounded-[6px] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-3">
    <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
      <h3 className="truncate text-xs font-semibold text-[var(--color-theme-text)]">{title}</h3>
      {subtitle ? (
        <span className="shrink-0 text-[11px] text-[var(--color-theme-text-subtle)]">
          {subtitle}
        </span>
      ) : null}
    </div>
    {isEmpty ? (
      <div
        className="flex items-center justify-center text-xs text-[var(--color-theme-text-muted)]"
        style={{ height }}
      >
        {emptyText}
      </div>
    ) : (
      children
    )}
  </div>
)
