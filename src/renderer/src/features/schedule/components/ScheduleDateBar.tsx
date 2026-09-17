import { LxDatePicker } from "@/components/ui/LxDatePicker"
import { useTranslation } from "@/i18n"
import { getTodayKey } from "@/lib/date"

// 日期导航条属性。
export interface ScheduleDateBarProps {
  entryDate: string
  onChange: (dateKey: string) => void
  // 每日条目数角标映射。
  entryCountMap: Record<string, number>
  // 日历弹层可见月份变化回调。
  onVisibleMonthChange: (monthKey: string) => void
}

/**
 * 渲染日程日期导航：前一天 / 日期选择 / 后一天（切换按钮由日期选择器内置）/ 回到今天。
 */
export const ScheduleDateBar = ({
  entryDate,
  onChange,
  entryCountMap,
  onVisibleMonthChange,
}: ScheduleDateBarProps): React.JSX.Element => {
  const { t } = useTranslation()
  const isToday = entryDate === getTodayKey()

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <LxDatePicker
        value={entryDate}
        entryCountMap={entryCountMap}
        onChange={onChange}
        onVisibleMonthChange={onVisibleMonthChange}
        showNavButtons
        triggerClassName="w-[176px] justify-center"
      />

      <button
        type="button"
        disabled={isToday}
        className="lx-schedule-today flex h-7 items-center rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border-strong)] bg-[var(--color-theme-surface)] px-2.5 text-xs text-[var(--color-theme-text-muted)] transition-colors hover:bg-[var(--color-theme-surface-hover)] hover:text-[var(--color-theme-text)] disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => onChange(getTodayKey())}
      >
        {t("schedule.backToToday")}
      </button>
    </div>
  )
}
