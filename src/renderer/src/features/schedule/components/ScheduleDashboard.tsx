import { ArrowUpDown, CalendarDays } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useTranslation } from "@/i18n"
import {
  formatDateLabel,
  formatWeekdayShort,
  getMonthKey,
  getMonthRange,
  getRecentRange,
  getTodayKey,
} from "@/lib/date"
import { SCHEDULE_TREND_DAYS } from "../constants"
import { useScheduleItems } from "../hooks/useScheduleItems"
import { useScheduleMutations } from "../hooks/useScheduleMutations"
import { useScheduleStats } from "../hooks/useScheduleStats"
import { ScheduleComposer } from "./ScheduleComposer"
import { ScheduleDateBar } from "./ScheduleDateBar"
import { ScheduleItemRow } from "./ScheduleItemRow"
import { ScheduleStatsPanel } from "./ScheduleStatsPanel"

/**
 * 渲染日程工作台：日期导航、单日待办列表与统计面板。
 */
export const ScheduleDashboard = (): React.JSX.Element => {
  const { t, locale } = useTranslation()
  // 当前查看日期。
  const [entryDate, setEntryDate] = useState<string>(getTodayKey)
  // 日历弹层可见月份（用于逐月加载角标）。
  const [visibleMonth, setVisibleMonth] = useState<string>(() => getMonthKey(getTodayKey()))

  const { items, setItems, isLoading, hasError, reload } = useScheduleItems(entryDate)

  // 月历角标与近 7 日趋势共用区间统计查询。
  const monthRange = useMemo(() => getMonthRange(visibleMonth), [visibleMonth])
  const trendRange = useMemo(() => getRecentRange(entryDate, SCHEDULE_TREND_DAYS), [entryDate])
  const { stats: monthStats, reload: reloadMonthStats } = useScheduleStats(
    monthRange.startDate,
    monthRange.endDate,
  )
  const { stats: trendStats, reload: reloadTrendStats } = useScheduleStats(
    trendRange.startDate,
    trendRange.endDate,
  )

  const handleStatsChanged = useCallback((): void => {
    void reloadMonthStats()
    void reloadTrendStats()
  }, [reloadMonthStats, reloadTrendStats])

  const mutations = useScheduleMutations({
    entryDate,
    items,
    setItems,
    onChanged: handleStatsChanged,
  })

  const entryCountMap = useMemo(
    () => Object.fromEntries(monthStats.map((entry) => [entry.date, entry.plannedCount])),
    [monthStats],
  )
  const completedCount = items.filter((item) => item.completed).length

  return (
    <div className="custom-scrollbar flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-4 [scrollbar-gutter:stable] xl:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        {/* 标题与日期导航 */}
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight text-[var(--color-theme-text)]">
              {t("schedule.title")}
            </h1>
            <p className="truncate text-sm text-[var(--color-theme-text-muted)]">
              {t("schedule.subtitle")}
            </p>
          </div>
          <ScheduleDateBar
            entryDate={entryDate}
            entryCountMap={entryCountMap}
            onChange={setEntryDate}
            onVisibleMonthChange={setVisibleMonth}
          />
        </div>

        {/* 单日列表 */}
        <section className="lx-schedule-board relative flex min-h-0 flex-1 flex-col rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-3">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-theme-border)] pb-2">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-[var(--color-theme-text)]">
                {formatDateLabel(entryDate, locale)} · {formatWeekdayShort(entryDate, locale)}
              </h2>
              <p className="text-[11px] text-[var(--color-theme-text-muted)]">
                {t("schedule.progress", { done: completedCount, total: items.length })}
              </p>
            </div>
            <LxIconButton
              size="small"
              aria-label={t("schedule.sortByPriority")}
              disabled={items.length < 2}
              title={{ content: t("schedule.sortByPriority"), placement: "top" }}
              onClick={() => void mutations.sortItems()}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
            </LxIconButton>
          </div>

          <div className="mt-2">
            <ScheduleComposer onSubmit={mutations.createItem} />
          </div>

          <div className="custom-scrollbar mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
            {hasError ? (
              <div className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-base)] border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                <span>{t("schedule.loadFailed")}</span>
                <button
                  type="button"
                  className="shrink-0 underline-offset-2 hover:underline"
                  onClick={() => void reload()}
                >
                  {t("common.refresh")}
                </button>
              </div>
            ) : null}

            {!hasError && isLoading ? (
              <p className="px-1 py-3 text-xs text-[var(--color-theme-text-subtle)]">
                {t("schedule.loading")}
              </p>
            ) : null}

            {!hasError && !isLoading && items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center">
                <CalendarDays className="h-6 w-6 text-[var(--color-theme-text-subtle)]" />
                <h3 className="mt-1 text-sm font-semibold text-[var(--color-theme-text)]">
                  {t("schedule.emptyTitle")}
                </h3>
                <p className="max-w-[320px] text-xs text-[var(--color-theme-text-muted)]">
                  {t("schedule.emptyDescription")}
                </p>
              </div>
            ) : null}

            {!hasError && !isLoading
              ? items.map((item) => (
                  <ScheduleItemRow
                    key={item.id}
                    item={item}
                    onToggle={mutations.toggleItem}
                    onCyclePriority={mutations.cyclePriority}
                    onRename={mutations.renameItem}
                    onMove={mutations.moveItem}
                    onDelete={mutations.deleteItem}
                  />
                ))
              : null}
          </div>
        </section>
      </div>

      <ScheduleStatsPanel items={items} trendStats={trendStats} trendEndDate={entryDate} />
    </div>
  )
}
