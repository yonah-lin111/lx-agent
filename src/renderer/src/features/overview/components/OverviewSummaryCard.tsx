import { CalendarClock, CheckCircle2, MessageSquare, Timer, Wrench } from "lucide-react"
import { useMemo } from "react"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { useTranslation } from "@/i18n"
import type { OverviewPeriodSummary, OverviewTimeRange } from "../types"
import { formatNumber } from "../utils"

export interface OverviewSummaryCardProps {
  periodSummary?: OverviewPeriodSummary
  timeRange: OverviewTimeRange
  onTimeRangeChange?: (range: OverviewTimeRange) => void
  timeRangeOptions?: LxSelectOption<OverviewTimeRange>[]
}

/**
 * 渲染周期/今日统计简报说明卡片（支持主题系统与纯色实体背景）。
 */
export const OverviewSummaryCard = ({
  periodSummary,
  timeRange,
  onTimeRangeChange,
  timeRangeOptions,
}: OverviewSummaryCardProps): React.JSX.Element => {
  const { t } = useTranslation()

  const defaultOptions: LxSelectOption<OverviewTimeRange>[] = useMemo(
    () => [
      { value: "today", label: t("home.timeRange.today") },
      { value: "7d", label: t("home.timeRange.7d") },
      { value: "30d", label: t("home.timeRange.30d") },
      { value: "all", label: t("home.timeRange.all") },
    ],
    [t],
  )

  const options = timeRangeOptions ?? defaultOptions
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
    <div className="flex min-w-0 flex-col gap-2">
      {/* 头部标题与右上角时间周期切换器（位于卡片外部） */}
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] border border-[#203754] bg-[#152336] text-sky-400">
            <CalendarClock className="h-3.5 w-3.5" />
          </div>
          <h2 className="truncate text-xs font-semibold text-white/90">{cardTitle}</h2>
        </div>

        {/* 右上角时间筛选 Select */}
        <div className="w-28 sm:w-32 shrink-0">
          <LxSelect
            size="small"
            value={timeRange}
            options={options}
            onChange={(val) => onTimeRangeChange?.(val as OverviewTimeRange)}
          />
        </div>
      </div>

      {/* 统计简报卡片主体 */}
      <div className="overview-summary-card relative flex min-w-0 flex-col gap-3 rounded-[6px] border border-[#333333] bg-[#1e1e1e] p-3.5 transition-colors">
        {/* 简要说明文案 */}
        <p className="text-xs leading-relaxed text-white/60">
          {t("home.summary.summaryText", {
            turns: formatNumber(turns),
            toolCalls: formatNumber(toolCalls),
            successRate,
            avgDuration,
          })}
        </p>

        {/* 4 组细分统计指标条（采用纯色实体背景，非半透明） */}
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
          {/* 对话轮次 */}
          <div className="overview-summary-item flex min-w-0 items-center gap-2 rounded-[4px] border border-[#333333] bg-[#282828] p-2">
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-sky-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[10px] text-white/45">{t("home.summary.turns")}</div>
              <div className="truncate text-xs font-semibold text-white/90">
                {formatNumber(turns)}
              </div>
            </div>
          </div>

          {/* 工具调用 */}
          <div className="overview-summary-item flex min-w-0 items-center gap-2 rounded-[4px] border border-[#333333] bg-[#282828] p-2">
            <Wrench className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[10px] text-white/45">
                {t("home.summary.toolCalls")}
              </div>
              <div className="truncate text-xs font-semibold text-white/90">
                {formatNumber(toolCalls)}
              </div>
            </div>
          </div>

          {/* 成功率 */}
          <div className="overview-summary-item flex min-w-0 items-center gap-2 rounded-[4px] border border-[#333333] bg-[#282828] p-2">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[10px] text-white/45">
                {t("home.summary.successRate")}
              </div>
              <div className="truncate text-xs font-semibold text-emerald-400">{successRate}%</div>
            </div>
          </div>

          {/* 执行耗时 */}
          <div className="overview-summary-item flex min-w-0 items-center gap-2 rounded-[4px] border border-[#333333] bg-[#282828] p-2">
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
    </div>
  )
}
