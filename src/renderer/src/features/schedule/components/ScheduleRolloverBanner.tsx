import { CalendarClock, X } from "lucide-react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useTranslation } from "@/i18n"

// 顺延横幅属性。
export interface ScheduleRolloverBannerProps {
  count: number
  isRollingOver: boolean
  onRollover: () => void
  onDismiss: () => void
}

/**
 * 渲染昨日未完成待办唤醒横幅（非阻塞通知条）。
 */
export const ScheduleRolloverBanner = ({
  count,
  isRollingOver,
  onRollover,
  onDismiss,
}: ScheduleRolloverBannerProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="lx-schedule-rollover flex flex-wrap items-center justify-between gap-2.5 rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border-strong)] bg-[color-mix(in_srgb,var(--color-schedule-priority-p1)_10%,var(--color-theme-surface))] px-3 py-2 text-xs text-[var(--color-theme-text)] transition-colors">
      <div className="flex min-w-0 items-center gap-2">
        <CalendarClock className="h-4 w-4 shrink-0 text-[var(--color-schedule-priority-p1)]" />
        <span className="truncate font-medium">{t("schedule.rolloverPrompt", { count })}</span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled={isRollingOver}
          onClick={onRollover}
          className="flex h-6 items-center rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border-strong)] bg-[var(--color-theme-surface)] px-2.5 text-[11px] font-medium text-[var(--color-theme-text)] transition-colors hover:bg-[var(--color-theme-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRollingOver ? t("schedule.loading") : t("schedule.rolloverAction")}
        </button>

        <LxIconButton
          size="small"
          aria-label={t("schedule.rolloverDismiss")}
          title={{ content: t("schedule.rolloverDismiss"), placement: "top" }}
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </LxIconButton>
      </div>
    </div>
  )
}
