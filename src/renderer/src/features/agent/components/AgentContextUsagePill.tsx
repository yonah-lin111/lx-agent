import type React from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"

export interface AgentContextUsagePillProps {
  contextUsage?: { tokens: number; contextWindow: number } | null
  className?: string
}

// 状态小圆点背景颜色：≥100% 红（已满）/ >85% 琥珀（接近压缩触发区）/ 其余绿色（健康空闲）。
const dotColor = (percent: number): string => {
  if (percent >= 100) return "bg-red-400"
  if (percent > 85) return "bg-amber-400"
  return "bg-emerald-400"
}

/**
 * 渲染 Agent 当前会话的上下文容量统计 Pill。
 */
export const AgentContextUsagePill = ({
  contextUsage,
  className = "",
}: AgentContextUsagePillProps): React.JSX.Element => {
  const { t } = useTranslation()
  const percent =
    contextUsage && contextUsage.contextWindow > 0
      ? Math.min(100, Math.round((contextUsage.tokens / contextUsage.contextWindow) * 100))
      : 0

  const tooltipContent =
    contextUsage && contextUsage.contextWindow > 0
      ? t("agent.contextUsed", {
          used: contextUsage.tokens.toLocaleString(),
          total: contextUsage.contextWindow.toLocaleString(),
        })
      : t("agent.contextCapacity")

  return (
    <LxTooltip placement="top" content={tooltipContent}>
      <span
        aria-label={t("agent.contextCapacity")}
        className={`agent-status-context-pill flex shrink-0 cursor-default items-center gap-1.5 rounded-[4px] px-1.5 py-0.5 text-xs text-white/70 transition-colors hover:bg-white/5 ${className}`.trim()}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor(percent)}`} />
        <span className="tabular-nums">{percent}%</span>
      </span>
    </LxTooltip>
  )
}
