import type { ReactNode } from "react"

// 图表卡片属性。
export interface LxChartCardProps {
  title: string
  subtitle?: string
  // 是否展示空态占位。
  isEmpty: boolean
  emptyText: string
  // 图表区高度（空态占位与内容区共用）。
  height?: number
  children: ReactNode
}

/**
 * 通用图表卡片外壳：标题、副标题与空态占位。
 * 颜色走主题 token，Minecraft 等主题通过 .lx-chart-card 类名挂钩覆盖。
 */
export const LxChartCard = ({
  title,
  subtitle,
  isEmpty,
  emptyText,
  height = 240,
  children,
}: LxChartCardProps): React.JSX.Element => (
  <div className="lx-chart-card flex min-w-0 flex-col rounded-[6px] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-3">
    <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
      <h3 className="truncate text-sm font-semibold text-[var(--color-theme-text)]">{title}</h3>
      {subtitle ? (
        <span className="shrink-0 text-xs text-[var(--color-theme-text-subtle)]">{subtitle}</span>
      ) : null}
    </div>
    {isEmpty ? (
      <div
        className="flex items-center justify-center text-sm text-[var(--color-theme-text-muted)]"
        style={{ height }}
      >
        {emptyText}
      </div>
    ) : (
      children
    )}
  </div>
)
