import { Bot, CalendarClock, Flame, Layers, Wrench } from "lucide-react"
import { useMemo } from "react"
import { LxLoadingOverlay } from "@/components/ui/LxLoadingOverlay"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { useTranslation } from "@/i18n"
import { useOverviewData } from "../hooks/useOverviewData"
import type { OverviewTimeRange } from "../types"
import { formatNumber } from "../utils"
import { ActivityHeatmap } from "./ActivityHeatmap"
import { MetricCard } from "./MetricCard"
import { OverviewSummaryCard } from "./OverviewSummaryCard"

/**
 * 渲染主页概览完整数据看板（支持窄屏自适应与主题兼容）。
 */
export const OverviewDashboard = (): React.JSX.Element => {
  const { t } = useTranslation()
  const {
    heatmapProjectId,
    setHeatmapProjectId,
    selectedTimeRange,
    setSelectedTimeRange,
    stats,
    isLoading,
    error,
  } = useOverviewData()

  // 构造时间跨度切换项
  const timeRangeOptions: LxSelectOption<OverviewTimeRange>[] = useMemo(
    () => [
      { value: "today", label: t("home.timeRange.today") },
      { value: "7d", label: t("home.timeRange.7d") },
      { value: "30d", label: t("home.timeRange.30d") },
      { value: "all", label: t("home.timeRange.all") },
    ],
    [t],
  )

  // 构造项目切换下拉项（独立用于绿墙热力图）
  const projectOptions: LxSelectOption<string>[] = useMemo(() => {
    const defaultOption: LxSelectOption<string> = {
      value: "all",
      label: t("home.allProjects"),
    }
    const dynamicOptions: LxSelectOption<string>[] = (stats?.projects ?? []).map((p) => ({
      value: p.id,
      label: p.name,
    }))
    return [defaultOption, ...dynamicOptions]
  }, [stats?.projects, t])

  const metrics = stats?.metrics
  const heatmap = stats?.activityHeatmap ?? []

  const totalYearActivities = useMemo(
    () => heatmap.reduce((acc, curr) => acc + curr.count, 0),
    [heatmap],
  )

  const maxHeatmapCount = useMemo(
    () => heatmap.reduce((max, entry) => Math.max(max, entry.count), 0),
    [heatmap],
  )

  const isToday = selectedTimeRange === "today"
  const rangeLabel = t(`home.timeRange.${selectedTimeRange}`)
  const summaryTitle = isToday
    ? t("home.summary.todayTitle")
    : t("home.summary.rangeTitle", { range: rangeLabel })

  const formattedLastActive = useMemo(() => {
    if (!metrics?.sessions.lastActiveAt) return t("home.metrics.never")
    try {
      const date = new Date(metrics.sessions.lastActiveAt)
      return date.toLocaleDateString()
    } catch {
      return metrics.sessions.lastActiveAt
    }
  }, [metrics?.sessions.lastActiveAt, t])

  return (
    <div className="overview-container relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 custom-scrollbar [scrollbar-gutter:stable] [contain:paint] [transform:translateZ(0)]">
      <LxLoadingOverlay isLoading={isLoading && !stats} text="Loading overview..." />

      {/* 顶部主标题 */}
      <div className="mb-4 min-w-0">
        <h1 className="truncate text-base font-bold tracking-tight text-white">
          {t("home.overview")}
        </h1>
        <p className="truncate text-xs text-white/50">{t("home.overviewSubtitle")}</p>
      </div>

      {error ? (
        <div className="rounded-[6px] border border-[#552222] bg-[#2a1212] p-3 text-xs text-red-400">
          {error}
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-6">
          {/* === 区域 1：统计说明与核心指标 === */}
          <section className="flex min-w-0 flex-col gap-3">
            {/* 卡片外层行：最左侧 Title，同行最右侧独立时间范围筛选器 */}
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] border border-[#203754] bg-[#152336] text-sky-400">
                  <CalendarClock className="h-3.5 w-3.5" />
                </div>
                <h2 className="truncate text-xs font-semibold text-white/90">{summaryTitle}</h2>
              </div>

              <div className="w-28 sm:w-32 shrink-0">
                <LxSelect
                  size="small"
                  value={selectedTimeRange}
                  options={timeRangeOptions}
                  onChange={(val) => setSelectedTimeRange(val as OverviewTimeRange)}
                />
              </div>
            </div>

            {/* 今日/周期数据统计说明简报 */}
            <OverviewSummaryCard periodSummary={metrics?.periodSummary} />

            {/* 4 组核心数据指标卡片 */}
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {/* 1. Agent 交互总量 */}
              <MetricCard
                icon={Bot}
                iconColor="text-sky-400"
                title={t("home.metrics.agentTurns")}
                subtitle={t("home.metrics.agentTurnsDesc")}
                mainValue={formatNumber(metrics?.agentTurns.total30d ?? 0)}
                badge={{
                  label: `+${metrics?.agentTurns.today ?? 0} ${t("home.metrics.todayTurns")}`,
                  variant: "info",
                }}
              />

              {/* 2. 工具调用总数与成功率 */}
              <MetricCard
                icon={Wrench}
                iconColor="text-amber-400"
                title={t("home.metrics.toolCalls")}
                subtitle={t("home.metrics.toolCallsDesc")}
                mainValue={formatNumber(metrics?.toolCalls.total ?? 0)}
                badge={{
                  label: `${metrics?.toolCalls.successRate ?? 100}% ${t("home.metrics.successRate")}`,
                  variant: "success",
                }}
              />

              {/* 3. 活跃天数与连续打卡 */}
              <MetricCard
                icon={Flame}
                iconColor="text-orange-400"
                title={t("home.metrics.activeDays")}
                subtitle={t("home.metrics.activeDaysDesc")}
                mainValue={`${metrics?.activeDays.totalDays ?? 0} ${t("home.metrics.daysUnit")}`}
                badge={{
                  label: t("home.metrics.longestStreak", {
                    count: metrics?.activeDays.longestStreak ?? 0,
                  }),
                  variant: "warning",
                }}
                extra={
                  <div className="flex min-w-0 items-center justify-between gap-1 text-[11px] text-white/50">
                    <span className="truncate">
                      {t("home.metrics.currentStreak", {
                        count: metrics?.activeDays.currentStreak ?? 0,
                      })}
                    </span>
                    <span className="truncate">
                      {t("home.metrics.activeRate", {
                        rate: metrics?.activeDays.activeRate ?? 0,
                      })}
                    </span>
                  </div>
                }
              />

              {/* 4. 会话总览 */}
              <MetricCard
                icon={Layers}
                iconColor="text-purple-400"
                title={t("home.metrics.sessions")}
                subtitle={t("home.metrics.sessionsDesc")}
                mainValue={formatNumber(metrics?.sessions.total ?? 0)}
                extra={
                  <div className="truncate text-[11px] text-white/50">
                    {t("home.metrics.lastActive")}: {formattedLastActive}
                  </div>
                }
              />
            </div>
          </section>

          {/* === 区域 2：生产力绿墙热力图 === */}
          <section className="flex min-w-0 flex-col gap-3">
            {/* 绿墙卡片外层行：最左侧 Title（含活动计数），同行最右侧独立项目筛选器 */}
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-baseline gap-2.5">
                <h2 className="truncate text-xs font-semibold text-white/90">
                  {t("home.heatmap.title")}
                </h2>
                <span className="font-mono text-xs font-semibold text-emerald-400">
                  {t("home.heatmap.activities", { count: totalYearActivities })}
                </span>
                {maxHeatmapCount > 0 && (
                  <span className="hidden sm:inline font-mono text-[10px] text-white/35">
                    (Max: {maxHeatmapCount}/day)
                  </span>
                )}
              </div>

              <div className="w-40 sm:w-48 shrink-0">
                <LxSelect
                  size="small"
                  value={heatmapProjectId}
                  options={projectOptions}
                  onChange={setHeatmapProjectId}
                />
              </div>
            </div>

            {/* 生产力绿墙热力图卡片 */}
            <ActivityHeatmap entries={heatmap} />
          </section>
        </div>
      )}
    </div>
  )
}
