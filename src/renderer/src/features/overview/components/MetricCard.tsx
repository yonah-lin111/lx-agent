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
 * 渲染单个概览核心统计卡片。
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
    <div className="flex flex-col justify-between rounded-[6px] border border-white/5 bg-[#262626] p-4 transition-colors hover:border-white/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-white/5">
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xs font-semibold text-white/80">{title}</h3>
            <p className="truncate text-[11px] text-white/45">{subtitle}</p>
          </div>
        </div>
        {badge && (
          <span
            className={`shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium leading-none ${
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

      <div className="mt-4 flex items-baseline justify-between">
        <div className="font-mono text-2xl font-bold tracking-tight text-white">{mainValue}</div>
      </div>

      {extra && <div className="mt-3 border-t border-white/5 pt-2.5 text-xs">{extra}</div>}
    </div>
  )
}
