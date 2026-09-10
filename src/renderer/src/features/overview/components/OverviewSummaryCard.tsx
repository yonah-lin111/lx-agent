import { CalendarClock, CheckCircle2, MessageSquare, Timer, Wrench } from "lucide-react"
import { useTranslation } from "@/i18n"
import type { OverviewPeriodSummary, OverviewTimeRange } from "../types"
import { formatNumber } from "../utils"

export interface OverviewSummaryCardProps {
  periodSummary?: OverviewPeriodSummary
  timeRange: OverviewTimeRange
}

/**
 * 渲染周期/今日统计简报说明卡片（支持主题系统与像素化适配）。
 */
export const OverviewSummaryCard = ({
  periodSummary,
  timeRange,
}: OverviewSummaryCardProps): React.JSX.Element => {
  const { t } = useTranslation()

  const turns = periodSummary?.turns ?? 0
  const toolCalls = periodSummary?.toolCalls ?? 0
  const successRate = periodSummary?.toolSuccessRate ?? 100
  const avgDuration = periodSummary?.toolAvgDurationMs ?? 0

  const isToday = timeRange === "today"
  const rangeLabel = t(`home.timeRange.${timeRange}`)
  const cardTitle = isToday
    ? t("home.summary.todayTitle")
    : t("home.summary.rangeTitle", { range: rangeLabel })

  return (
    <div className="overview-summary-card relative flex min-w-0 flex-col gap-3 rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3.5 transition-colors">
      {/* 头部标题与周期 Badge */}
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-sky-500/10 text-sky-400">
            <CalendarClock className="h-3.5 w-3.5" />
          </div>
          <h2 className="truncate text-xs font-semibold text-white/90">{cardTitle}</h2>
        </div>
        <span className="overview-badge shrink-0 rounded-[4px] border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-300">
          {rangeLabel}
        </span>
      </div>

      {/* 简要说明文案 */}
      <p className="text-xs leading-relaxed text-white/60">
        {t("home.summary.summaryText", {
          turns: formatNumber(turns),
          toolCalls: formatNumber(toolCalls),
          successRate,
          avgDuration,
        })}
      </p>

      {/* 4 组细分统计指标条 */}
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
        {/* 对话轮次 */}
        <div className="overview-summary-item flex min-w-0 items-center gap-2 rounded-[4px] border border-white/5 bg-white/[0.02] p-2">
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-sky-400" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] text-white/45">{t("home.summary.turns")}</div>
            <div className="truncate text-xs font-semibold text-white/90">
              {formatNumber(turns)}
            </div>
          </div>
        </div>

        {/* 工具调用 */}
        <div className="overview-summary-item flex min-w-0 items-center gap-2 rounded-[4px] border border-white/5 bg-white/[0.02] p-2">
          <Wrench className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] text-white/45">{t("home.summary.toolCalls")}</div>
            <div className="truncate text-xs font-semibold text-white/90">
              {formatNumber(toolCalls)}
            </div>
          </div>
        </div>

        {/* 成功率 */}
        <div className="overview-summary-item flex min-w-0 items-center gap-2 rounded-[4px] border border-white/5 bg-white/[0.02] p-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] text-white/45">
              {t("home.summary.successRate")}
            </div>
            <div className="truncate text-xs font-semibold text-emerald-400">{successRate}%</div>
          </div>
        </div>

        {/* 执行耗时 */}
        <div className="overview-summary-item flex min-w-0 items-center gap-2 rounded-[4px] border border-white/5 bg-white/[0.02] p-2">
          <Timer className="h-3.5 w-3.5 shrink-0 text-purple-400" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] text-white/45">
              {t("home.summary.avgDuration")}
            </div>
            <div className="truncate text-xs font-semibold text-white/90">
              {avgDuration}
              <span className="ml-0.5 text-[10px] font-normal text-white/45">ms</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
