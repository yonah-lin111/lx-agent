import type { LucideIcon } from "lucide-react"
import type React from "react"

// 概览指标卡片属性。
export interface MetricCardProps {
  icon: LucideIcon
  iconColor?: string
  title: string
  subtitle: string
  mainValue: string | number
  badge?: {
    label: string
    variant?: "success" | "neutral" | "info"
  }
  extra?: React.ReactNode
}

/**
 * 渲染单个概览核心统计卡片（适配主题与窄屏弹性伸缩）。
 */
export const MetricCard = ({
  icon: Icon,
  iconColor = "text-sky-400/80",
  title,
  subtitle,
  mainValue,
  badge,
  extra,
}: MetricCardProps): React.JSX.Element => {
  return (
    <div className="overview-metric-card flex min-w-0 flex-col justify-between rounded-[6px] border border-white/5 bg-[#262626] p-3.5 transition-colors hover:border-white/10">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="overview-metric-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-white/5">
            <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xs font-semibold text-white/80">{title}</h3>
            <p className="truncate text-[10px] text-white/45">{subtitle}</p>
          </div>
        </div>
        {badge && (
          <span
            className={`overview-badge shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium leading-none ${
              badge.variant === "success"
                ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : badge.variant === "info"
                  ? "border border-sky-500/20 bg-sky-500/10 text-sky-400"
                  : "border border-white/10 bg-white/5 text-white/60"
            }`}
          >
            {badge.label}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between min-w-0">
        <div className="truncate font-mono text-xl font-bold tracking-tight text-white xl:text-2xl">
          {mainValue}
        </div>
      </div>

      {extra && <div className="mt-2.5 min-w-0 border-t border-white/5 pt-2 text-xs">{extra}</div>}
    </div>
  )
}
