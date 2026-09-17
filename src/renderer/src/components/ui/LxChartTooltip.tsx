// Recharts 注入的 tooltip 数据项。
export interface LxChartTooltipEntry {
  name?: string
  value?: number | string
  color?: string
  dataKey?: string
}

export interface LxChartTooltipProps {
  active?: boolean
  payload?: LxChartTooltipEntry[]
  label?: string | number
  valueFormatter?: (entry: LxChartTooltipEntry) => string
}

/**
 * 通用图表 tooltip：主题化外观与可定制数值格式。
 * 颜色走主题 token，像素等主题通过 .lx-chart-tooltip 类名挂钩覆盖。
 */
export const LxChartTooltip = ({
  active,
  payload,
  label,
  valueFormatter,
}: LxChartTooltipProps): React.JSX.Element | null => {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="lx-chart-tooltip rounded-[6px] border border-[var(--color-theme-border-strong)] bg-[var(--color-theme-surface-hover)] p-2 shadow-lg">
      {label !== undefined ? (
        <p className="mb-1 text-xs font-medium text-[var(--color-theme-text)]">{label}</p>
      ) : null}
      <div className="flex flex-col gap-0.5">
        {payload.map((entry, index) => (
          <div
            key={`${entry.dataKey ?? entry.name ?? index}`}
            className="flex items-center gap-1.5 text-xs"
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-[var(--color-theme-text-muted)]">{entry.name}</span>
            <span className="ml-3 text-[var(--color-theme-text)]">
              {valueFormatter ? valueFormatter(entry) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
