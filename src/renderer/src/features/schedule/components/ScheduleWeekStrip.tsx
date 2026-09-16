import { ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import { formatDateLabel, getTodayKey, shiftDateKey } from "@/lib/date"
import { getWeekDates } from "../utils"

// 周感知带属性。
export interface ScheduleWeekStripProps {
  selectedDate: string
  onSelectDate: (dateKey: string) => void
  statsMap?: Record<string, { plannedCount: number; completedCount: number }>
}

/**
 * 渲染周透视感知带：周一至周日平铺、快速切日、当日高亮与待办数微指示。
 */
export const ScheduleWeekStrip = ({
  selectedDate,
  onSelectDate,
  statsMap = {},
}: ScheduleWeekStripProps): React.JSX.Element => {
  const { t, locale } = useTranslation()
  const todayKey = getTodayKey()

  const weekDays = useMemo(
    () => getWeekDates(selectedDate, todayKey, locale, statsMap),
    [selectedDate, todayKey, locale, statsMap],
  )

  const handlePrevWeek = (): void => {
    onSelectDate(shiftDateKey(selectedDate, -7))
  }

  const handleNextWeek = (): void => {
    onSelectDate(shiftDateKey(selectedDate, 7))
  }

  return (
    <div className="lx-schedule-week-strip flex w-full items-center gap-1.5 rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-1.5">
      <LxIconButton
        size="small"
        aria-label={t("schedule.previousWeek")}
        title={{ content: t("schedule.previousWeek"), placement: "top" }}
        onClick={handlePrevWeek}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </LxIconButton>

      <div className="grid flex-1 grid-cols-7 gap-1">
        {weekDays.map((day) => {
          const isFullDone = day.entryCount > 0 && day.completedCount === day.entryCount
          const isSelected = day.isSelected

          return (
            <LxTooltip
              key={day.dateKey}
              content={formatDateLabel(day.dateKey, locale)}
              placement="top"
            >
              <button
                type="button"
                onClick={() => onSelectDate(day.dateKey)}
                className={`group relative flex flex-col items-center justify-center rounded-[var(--theme-radius-base)] border py-1.5 px-1 transition-all ${
                  isSelected
                    ? "border-[var(--color-theme-accent)] bg-[var(--color-theme-surface-hover)] shadow-xs"
                    : "border-transparent bg-transparent hover:border-[var(--color-theme-border)] hover:bg-[var(--color-theme-surface-hover)]"
                }`}
              >
                {/* 星期标签 */}
                <span
                  className={`text-[10px] uppercase tracking-wider ${
                    isSelected
                      ? "font-semibold text-[var(--color-theme-text)]"
                      : "text-[var(--color-theme-text-muted)] group-hover:text-[var(--color-theme-text)]"
                  }`}
                >
                  {day.weekdayLabel}
                </span>

                {/* 日期数字与今天指示标 */}
                <div className="mt-0.5 flex items-center gap-1">
                  <span
                    className={`font-mono text-xs font-semibold ${
                      isSelected
                        ? "text-[var(--color-theme-text)]"
                        : "text-[var(--color-theme-text-muted)] group-hover:text-[var(--color-theme-text)]"
                    }`}
                  >
                    {day.dayOfMonth}
                  </span>
                  {day.isToday ? (
                    <span
                      aria-label={t("schedule.todayBadge")}
                      className="h-1.5 w-1.5 rounded-full bg-[var(--color-theme-accent)]"
                    />
                  ) : null}
                </div>

                {/* 待办数量与进度角标 */}
                <div className="mt-1 flex h-3.5 items-center">
                  {day.entryCount > 0 ? (
                    <span
                      className={`inline-flex items-center rounded-full px-1.5 font-mono text-[9px] font-medium leading-none ${
                        isFullDone
                          ? "bg-[color-mix(in_srgb,var(--color-schedule-chart-completed)_15%,transparent)] text-[var(--color-schedule-chart-completed)]"
                          : "bg-[var(--color-theme-surface-hover)] text-[var(--color-theme-text-subtle)]"
                      }`}
                    >
                      {day.completedCount}/{day.entryCount}
                    </span>
                  ) : (
                    <span className="h-1 w-1 rounded-full bg-[var(--color-theme-border)] opacity-30" />
                  )}
                </div>
              </button>
            </LxTooltip>
          )
        })}
      </div>

      <LxIconButton
        size="small"
        aria-label={t("schedule.nextWeek")}
        title={{ content: t("schedule.nextWeek"), placement: "top" }}
        onClick={handleNextWeek}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </LxIconButton>
    </div>
  )
}
