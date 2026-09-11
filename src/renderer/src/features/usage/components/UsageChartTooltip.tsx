// Recharts 注入的 tooltip 数据项。
export interface UsageChartTooltipEntry {
  name?: string
  value?: number | string
  color?: string
  dataKey?: string
}

export interface UsageChartTooltipProps {
  active?: boolean
  payload?: UsageChartTooltipEntry[]
  label?: string | number
  valueFormatter?: (entry: UsageChartTooltipEntry) => string
}

/**
 * 用量图表统一 tooltip：主题化外观与可定制数值格式。
 */
export const UsageChartTooltip = ({
  active,
  payload,
  label,
  valueFormatter,
}: UsageChartTooltipProps): React.JSX.Element | null => {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="usage-chart-tooltip rounded-[6px] border border-[var(--color-theme-border-strong)] bg-[var(--color-theme-surface-hover)] p-2 shadow-lg">
      {label !== undefined ? (
        <p className="mb-1 text-[11px] font-medium text-[var(--color-theme-text)]">{label}</p>
      ) : null}
      <div className="flex flex-col gap-0.5">
        {payload.map((entry, index) => (
          <div
            key={`${entry.dataKey ?? entry.name ?? index}`}
            className="flex items-center gap-1.5 text-[11px]"
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
