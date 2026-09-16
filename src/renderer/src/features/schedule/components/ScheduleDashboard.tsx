import { ArrowUpDown, CalendarDays, LayoutGrid, ListTodo, PanelRight } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
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
import { useScheduleRollover } from "../hooks/useScheduleRollover"
import { useScheduleStats } from "../hooks/useScheduleStats"
import type { ScheduleStatusFilter, ScheduleViewMode } from "../types"
import { filterScheduleItems } from "../utils"
import { ScheduleComposer } from "./ScheduleComposer"
import { ScheduleDateBar } from "./ScheduleDateBar"
import { ScheduleItemRow } from "./ScheduleItemRow"
import { ScheduleMatrixBoard } from "./ScheduleMatrixBoard"
import { ScheduleRolloverBanner } from "./ScheduleRolloverBanner"
import { ScheduleStatsPanel } from "./ScheduleStatsPanel"
import { ScheduleWeekStrip } from "./ScheduleWeekStrip"

const STORAGE_KEY_VIEW_MODE = "lx_schedule_view_mode"
const STORAGE_KEY_STATS_OPEN = "lx_schedule_stats_open"

/**
 * 渲染新一代日程工作台：周感知带、双模工作区（清单 / 四象限）、未完成顺延提醒与折叠洞察面板。
 */
export const ScheduleDashboard = (): React.JSX.Element => {
  const { t, locale } = useTranslation()
  const [entryDate, setEntryDate] = useState<string>(getTodayKey)
  const [visibleMonth, setVisibleMonth] = useState<string>(() => getMonthKey(getTodayKey()))

  // 视图模式与状态过滤。
  const [viewMode, setViewMode] = useState<ScheduleViewMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_VIEW_MODE)
    return saved === "matrix" ? "matrix" : "list"
  })
  const [statusFilter, setStatusFilter] = useState<ScheduleStatusFilter>("all")

  // 洞察面板折叠状态。
  const [isStatsOpen, setIsStatsOpen] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY_STATS_OPEN) !== "false"
  })

  const handleToggleViewMode = (mode: ScheduleViewMode): void => {
    setViewMode(mode)
    localStorage.setItem(STORAGE_KEY_VIEW_MODE, mode)
  }

  const handleToggleStats = (): void => {
    setIsStatsOpen((current) => {
      const next = !current
      localStorage.setItem(STORAGE_KEY_STATS_OPEN, String(next))
      return next
    })
  }

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
    void reload()
    void reloadMonthStats()
    void reloadTrendStats()
  }, [reload, reloadMonthStats, reloadTrendStats])

  const mutations = useScheduleMutations({
    entryDate,
    items,
    setItems,
    onChanged: handleStatsChanged,
  })

  // 昨日未完成待办顺延探测。
  const rollover = useScheduleRollover({
    entryDate,
    onRolloverCompleted: handleStatsChanged,
  })

  const entryCountMap = useMemo(
    () => Object.fromEntries(monthStats.map((entry) => [entry.date, entry.plannedCount])),
    [monthStats],
  )

  // 周感知带每日统计映射。
  const weekStatsMap = useMemo(
    () =>
      Object.fromEntries(
        monthStats.map((entry) => [
          entry.date,
          { plannedCount: entry.plannedCount, completedCount: entry.completedCount },
        ]),
      ),
    [monthStats],
  )

  const completedCount = items.filter((item) => item.completed).length
  const filteredItems = useMemo(
    () => filterScheduleItems(items, statusFilter),
    [items, statusFilter],
  )

  return (
    <div className="custom-scrollbar flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-4 [scrollbar-gutter:stable] xl:flex-row">
      <div className="flex w-full min-w-0 flex-1 flex-col gap-3 xl:min-h-0">
        {/* 顶部标题与日期导航 */}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
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

        {/* 周透视感知带 */}
        <ScheduleWeekStrip
          selectedDate={entryDate}
          onSelectDate={setEntryDate}
          statsMap={weekStatsMap}
        />

        {/* 昨日未完成顺延提醒栏 */}
        {rollover.hasRolloverItems ? (
          <ScheduleRolloverBanner
            count={rollover.count}
            isRollingOver={rollover.isRollingOver}
            onRollover={rollover.executeRollover}
            onDismiss={rollover.dismiss}
          />
        ) : null}

        {/* 核心工作区卡片 */}
        <section className="lx-schedule-board relative flex min-h-[420px] flex-1 flex-col rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-3 xl:min-h-0">
          {/* 工具条：日期进度 + 视图切换 + 状态过滤 + 排序与洞察面板开关 */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-theme-border)] pb-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <div>
                <h2 className="truncate text-sm font-semibold text-[var(--color-theme-text)]">
                  {formatDateLabel(entryDate, locale)} · {formatWeekdayShort(entryDate, locale)}
                </h2>
                <p className="text-[11px] text-[var(--color-theme-text-muted)]">
                  {t("schedule.progress", { done: completedCount, total: items.length })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* 视图双模切换：清单 / 四象限 */}
              <div className="flex items-center rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface-hover)] p-0.5">
                <button
                  type="button"
                  aria-label={t("schedule.viewList")}
                  className={`flex h-6 items-center gap-1 rounded-[calc(var(--theme-radius-base)-2px)] px-2 text-xs font-medium transition-colors ${
                    viewMode === "list"
                      ? "bg-[var(--color-theme-surface)] text-[var(--color-theme-text)] shadow-xs"
                      : "text-[var(--color-theme-text-muted)] hover:text-[var(--color-theme-text)]"
                  }`}
                  onClick={() => handleToggleViewMode("list")}
                >
                  <ListTodo className="h-3.5 w-3.5" />
                  <span>{t("schedule.viewList")}</span>
                </button>
                <button
                  type="button"
                  aria-label={t("schedule.viewMatrix")}
                  className={`flex h-6 items-center gap-1 rounded-[calc(var(--theme-radius-base)-2px)] px-2 text-xs font-medium transition-colors ${
                    viewMode === "matrix"
                      ? "bg-[var(--color-theme-surface)] text-[var(--color-theme-text)] shadow-xs"
                      : "text-[var(--color-theme-text-muted)] hover:text-[var(--color-theme-text)]"
                  }`}
                  onClick={() => handleToggleViewMode("matrix")}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>{t("schedule.viewMatrix")}</span>
                </button>
              </div>

              {/* 清单视图下的过滤药丸 */}
              {viewMode === "list" ? (
                <div className="hidden items-center gap-1 sm:flex">
                  {(["all", "pending", "completed"] as const).map((filterKey) => (
                    <button
                      key={filterKey}
                      type="button"
                      className={`h-6 rounded-full px-2 text-[11px] font-medium transition-colors ${
                        statusFilter === filterKey
                          ? "bg-[var(--color-theme-text)] text-[var(--color-theme-bg)]"
                          : "text-[var(--color-theme-text-muted)] hover:bg-[var(--color-theme-surface-hover)] hover:text-[var(--color-theme-text)]"
                      }`}
                      onClick={() => setStatusFilter(filterKey)}
                    >
                      {filterKey === "all"
                        ? t("schedule.filterAll")
                        : filterKey === "pending"
                          ? t("schedule.filterPending")
                          : t("schedule.filterCompleted")}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* 优先级重排（仅清单视图） */}
              {viewMode === "list" ? (
                <LxIconButton
                  size="small"
                  aria-label={t("schedule.sortByPriority")}
                  disabled={items.length < 2}
                  title={{ content: t("schedule.sortByPriority"), placement: "top" }}
                  onClick={() => void mutations.sortItems()}
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                </LxIconButton>
              ) : null}

              {/* 洞察面板显隐切换按钮 */}
              <LxTooltip
                content={isStatsOpen ? t("schedule.hideStats") : t("schedule.showStats")}
                placement="top"
              >
                <button
                  type="button"
                  aria-label={isStatsOpen ? t("schedule.hideStats") : t("schedule.showStats")}
                  className={`flex h-7 w-7 items-center justify-center rounded-[var(--theme-radius-base)] border transition-colors ${
                    isStatsOpen
                      ? "border-[var(--color-theme-border-strong)] bg-[var(--color-theme-surface-hover)] text-[var(--color-theme-text)]"
                      : "border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] text-[var(--color-theme-text-muted)] hover:text-[var(--color-theme-text)]"
                  }`}
                  onClick={handleToggleStats}
                >
                  <PanelRight className="h-3.5 w-3.5" />
                </button>
              </LxTooltip>
            </div>
          </div>

          {/* 核心工作区主内容 */}
          {viewMode === "list" ? (
            <div className="flex flex-1 flex-col overflow-hidden pt-2">
              <ScheduleComposer onSubmit={mutations.createItem} />

              <div className="custom-scrollbar mt-2 flex flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
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

                {!hasError && !isLoading && filteredItems.length === 0 ? (
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
                  ? filteredItems.map((item) => (
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
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-y-auto pt-2">
              <ScheduleMatrixBoard
                items={items}
                onToggle={mutations.toggleItem}
                onCyclePriority={mutations.cyclePriority}
                onRename={mutations.renameItem}
                onMove={mutations.moveItem}
                onDelete={mutations.deleteItem}
                onCreateInPriority={(content, priority) => mutations.createItem(content, priority)}
              />
            </div>
          )}
        </section>
      </div>

      {/* 可折叠洞察面板 */}
      {isStatsOpen ? (
        <ScheduleStatsPanel
          items={items}
          trendStats={trendStats}
          trendEndDate={entryDate}
          onClose={() => setIsStatsOpen(false)}
        />
      ) : null}
    </div>
  )
}
