import type React from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"

export interface AgentContextUsagePillProps {
  contextUsage?: { tokens: number; contextWindow: number } | null
  className?: string
}

// 状态小圆点背景颜色：≥90% 红（严重预警区）/ ≥75% 琥珀（引导感知区）/ 其余绿色（健康空闲）。
const dotColor = (percent: number): string => {
  if (percent >= 90) return "bg-red-400 animate-pulse"
  if (percent >= 75) return "bg-amber-400"
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
  const hasValidUsage =
    contextUsage !== null &&
    contextUsage !== undefined &&
    typeof contextUsage.tokens === "number" &&
    Number.isFinite(contextUsage.tokens) &&
    typeof contextUsage.contextWindow === "number" &&
    Number.isFinite(contextUsage.contextWindow) &&
    contextUsage.contextWindow > 0

  const percent = hasValidUsage
    ? Math.min(100, Math.max(0, Math.round((contextUsage.tokens / contextUsage.contextWindow) * 100)))
    : 0

  const baseText = hasValidUsage
    ? t("agent.contextUsed", {
        used: Math.max(0, Math.round(contextUsage.tokens)).toLocaleString(),
        total: Math.max(0, Math.round(contextUsage.contextWindow)).toLocaleString(),
      })
    : t("agent.contextCapacity")

  const extraTip =
    percent >= 90
      ? ` · ${t("agent.contextCriticalTip")}`
      : percent >= 75
        ? ` · ${t("agent.contextWarningTip")}`
        : ""

  const tooltipContent = `${baseText}${extraTip}`

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
