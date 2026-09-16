import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import type React from "react"
import {
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { useFloatingLayer, useLayerPresence } from "@/components/ui/useFloatingLayer"
import { type TranslationKey, useTranslation } from "@/i18n"
import {
  formatDateLabel,
  formatMonthLabel,
  getMonthGrid,
  getMonthKey,
  getTodayKey,
  getWeekdayLabels,
  getWeekStartKey,
  isValidDateKey,
  isValidMonthKey,
  shiftDateKey,
  shiftMonthKey,
} from "@/lib/date"

// 选择模式：按日 / 按周（值为周一日期键）/ 按月（值为 YYYY-MM）。
export type LxDatePickerMode = "date" | "week" | "month"

// 日期选择器属性。
export interface LxDatePickerProps {
  // 当前值：date/week 为 YYYY-MM-DD，month 为 YYYY-MM。
  value: string
  // 选择回调。
  onChange: (value: string) => void
  mode?: LxDatePickerMode
  placeholder?: string
  className?: string
  triggerClassName?: string
  // 自定义触发器；缺省时渲染内置日期按钮。
  children?: React.ReactNode
  disabled?: boolean
  // 每日条目数角标（仅 date 模式展示）。
  entryCountMap?: Record<string, number>
  // 弹层可见月份变化回调（供调用方按需加载月历角标）。
  onVisibleMonthChange?: (monthKey: string) => void
  // 是否展示快捷项（今天 / 昨天 / 明天），默认展示。
  quickSelects?: boolean
}

// 角标数字上限。
const BADGE_MAX_COUNT = 99

// 快捷项相对今天的偏移与文案 key。
const QUICK_SELECTS: Array<{ offset: number; labelKey: TranslationKey }> = [
  { offset: 0, labelKey: "common.datePicker.today" },
  { offset: -1, labelKey: "common.datePicker.yesterday" },
  { offset: 1, labelKey: "common.datePicker.tomorrow" },
]

// 弹层宽度（定位夹取时作为兜底尺寸）。
const POPOVER_FALLBACK_WIDTH = 292

/**
 * 渲染支持按日 / 按周 / 按月三态与每日角标的弹出式日期选择器。
 * 颜色全部走主题 token，Minecraft 等主题通过 .lx-datepicker-* 类名挂钩覆盖。
 */
export const LxDatePicker = ({
  value,
  onChange,
  mode = "date",
  placeholder,
  className = "",
  triggerClassName = "",
  children,
  disabled = false,
  entryCountMap,
  onVisibleMonthChange,
  quickSelects = true,
}: LxDatePickerProps): React.JSX.Element => {
  const { t, locale } = useTranslation()
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const todayKey = getTodayKey()
  const [visibleMonth, setVisibleMonth] = useState<string>(() => {
    if (mode === "month" && isValidMonthKey(value)) return value
    return getMonthKey(isValidDateKey(value) ? value : todayKey)
  })
  const [visibleYear, setVisibleYear] = useState<number>(() =>
    Number.parseInt(visibleMonth.slice(0, 4), 10),
  )
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // 挂载 / 退场状态机与外部关闭（点击外部、Esc、滚动）。
  const { shouldRender, isAnimatingOut } = useLayerPresence(isOpen)
  useFloatingLayer({
    isOpen,
    active: shouldRender,
    rootRef: popoverRef,
    insideRefs: [containerRef],
    anchorRef: containerRef,
    onClose: () => setIsOpen(false),
  })

  const gridDays = useMemo(() => getMonthGrid(visibleMonth), [visibleMonth])
  const weekdayLabels = useMemo(() => getWeekdayLabels(locale), [locale])
  const visibleMonthLabel = formatMonthLabel(visibleMonth, locale)
  const modeLabelKey: TranslationKey =
    mode === "week"
      ? "common.datePicker.selectWeek"
      : mode === "month"
        ? "common.datePicker.selectMonth"
        : "common.datePicker.selectDate"

  // 弹层按触发元素视口坐标定位（上下翻转 + 边界夹取），随视口尺寸变化重算。
  useLayoutEffect(() => {
    if (!shouldRender) return
    const updatePosition = (): void => {
      const trigger = containerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const width = popoverRef.current?.offsetWidth ?? POPOVER_FALLBACK_WIDTH
      const height = popoverRef.current?.offsetHeight ?? 320
      const margin = 8
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - margin - width),
      )
      const below = rect.bottom + 6
      const fitsBelow = below + height <= window.innerHeight - margin
      const above = rect.top - 6 - height
      const top = fitsBelow ? below : Math.max(margin, above)
      setPopoverPosition({ left, top })
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    return () => window.removeEventListener("resize", updatePosition)
  }, [shouldRender, visibleMonth, visibleYear, mode])

  // 外部值变化时同步可见月份 / 年份。
  useEffect(() => {
    if (mode === "month") {
      if (isValidMonthKey(value)) setVisibleYear(Number.parseInt(value.slice(0, 4), 10))
      return
    }
    if (isValidDateKey(value)) setVisibleMonth(getMonthKey(value))
  }, [value, mode])

  // 打开或切换月份时上报可见月份。
  useEffect(() => {
    if (isOpen && mode !== "month") onVisibleMonthChange?.(visibleMonth)
  }, [isOpen, mode, visibleMonth, onVisibleMonthChange])

  const handleToggle = (): void => {
    if (disabled) return
    setIsOpen((previous) => !previous)
  }

  const handleSelect = (nextValue: string): void => {
    setIsOpen(false)
    onChange(nextValue)
  }

  const displayLabel = (): string => {
    if (mode === "month") {
      return isValidMonthKey(value)
        ? formatMonthLabel(value, locale)
        : (placeholder ?? t("common.datePicker.placeholder"))
    }
    return isValidDateKey(value)
      ? formatDateLabel(value, locale)
      : (placeholder ?? t("common.datePicker.placeholder"))
  }

  // 自定义触发器：合并子元素自身 onClick 后接管展开 / 收起。
  const triggerElement = (() => {
    if (isValidElement(children)) {
      const child = children as React.ReactElement<{
        onClick?: (event: React.MouseEvent) => void
      }>
      return cloneElement(child, {
        onClick: (event: React.MouseEvent) => {
          child.props.onClick?.(event)
          handleToggle()
        },
        "aria-expanded": isOpen,
        "data-open": isOpen ? "true" : "false",
      } as Record<string, unknown>)
    }

    return (
      <button
        type="button"
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`lx-datepicker-trigger flex h-7 w-full items-center gap-1.5 rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border-strong)] bg-[var(--color-theme-surface)] px-2.5 text-left text-xs text-[var(--color-theme-text)] outline-none transition-colors duration-150 hover:bg-[var(--color-theme-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 ${triggerClassName}`}
        onClick={handleToggle}
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[var(--color-theme-text-muted)]" />
        <span className="min-w-0 flex-1 truncate">{displayLabel()}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[var(--color-theme-text-subtle)] transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
    )
  })()

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {triggerElement}

      {shouldRender &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={t(modeLabelKey)}
            data-mode={mode}
            className={`lx-datepicker fixed z-[9999] w-[292px] rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border-strong)] bg-[var(--color-theme-surface)] p-3 text-[var(--color-theme-text)] shadow-[0_18px_60px_rgba(0,0,0,0.55)] ${
              isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
            }`}
            style={{ ...(popoverPosition ?? undefined) }}
          >
            {mode === "month" ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="lx-datepicker-caption truncate text-xs uppercase tracking-[0.18em] text-[var(--color-theme-text-subtle)]">
                      {t("common.datePicker.selectMonth")}
                    </p>
                    <p className="text-sm font-semibold text-[var(--color-theme-text)]">
                      {visibleYear}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={t("common.datePicker.previousYear")}
                      className="lx-datepicker-nav flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--color-theme-text-muted)] transition-colors hover:bg-[var(--color-theme-surface-hover)] hover:text-[var(--color-theme-text)]"
                      onClick={() => setVisibleYear((previous) => previous - 1)}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("common.datePicker.nextYear")}
                      className="lx-datepicker-nav flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--color-theme-text-muted)] transition-colors hover:bg-[var(--color-theme-surface-hover)] hover:text-[var(--color-theme-text)]"
                      onClick={() => setVisibleYear((previous) => previous + 1)}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {Array.from({ length: 12 }, (_, index) => {
                    const monthValue = `${visibleYear}-${String(index + 1).padStart(2, "0")}`
                    const isSelected = value === monthValue
                    return (
                      <button
                        key={monthValue}
                        type="button"
                        aria-pressed={isSelected}
                        className={`lx-datepicker-month flex h-8 items-center justify-center rounded-[4px] border text-xs transition-colors ${
                          isSelected
                            ? "border-[var(--color-theme-accent)] bg-[var(--color-theme-surface-hover)] font-semibold text-[var(--color-theme-text)]"
                            : "border-transparent text-[var(--color-theme-text-muted)] hover:bg-[var(--color-theme-surface-hover)] hover:text-[var(--color-theme-text)]"
                        }`}
                        onClick={() => handleSelect(monthValue)}
                      >
                        {new Intl.DateTimeFormat(locale, { month: "short" }).format(
                          new Date(visibleYear, index, 1),
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="lx-datepicker-caption truncate text-xs uppercase tracking-[0.18em] text-[var(--color-theme-text-subtle)]">
                      {t(modeLabelKey)}
                    </p>
                    <p className="truncate text-sm font-semibold text-[var(--color-theme-text)]">
                      {visibleMonthLabel}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={t("common.datePicker.previousMonth")}
                      className="lx-datepicker-nav flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--color-theme-text-muted)] transition-colors hover:bg-[var(--color-theme-surface-hover)] hover:text-[var(--color-theme-text)]"
                      onClick={() => setVisibleMonth((previous) => shiftMonthKey(previous, -1))}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("common.datePicker.nextMonth")}
                      className="lx-datepicker-nav flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--color-theme-text-muted)] transition-colors hover:bg-[var(--color-theme-surface-hover)] hover:text-[var(--color-theme-text)]"
                      onClick={() => setVisibleMonth((previous) => shiftMonthKey(previous, 1))}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-7 gap-1">
                  {weekdayLabels.map((weekdayLabel) => (
                    <span
                      key={weekdayLabel}
                      className="flex h-6 items-center justify-center text-xs text-[var(--color-theme-text-subtle)]"
                    >
                      {weekdayLabel}
                    </span>
                  ))}
                </div>

                <div className="mt-1 grid grid-cols-7 gap-1">
                  {gridDays.map((day) => {
                    const entryCount = entryCountMap?.[day.dateKey] ?? 0
                    const isSelected =
                      mode === "week"
                        ? getWeekStartKey(day.dateKey) === value
                        : day.dateKey === value
                    const isToday = day.dateKey === todayKey
                    return (
                      <button
                        key={day.dateKey}
                        type="button"
                        aria-label={formatDateLabel(day.dateKey, locale)}
                        aria-pressed={isSelected}
                        data-date={day.dateKey}
                        data-today={isToday ? "true" : undefined}
                        data-outside={day.isCurrentMonth ? undefined : "true"}
                        className={`lx-datepicker-day relative flex aspect-square w-full items-center justify-center rounded-[4px] border text-xs transition-colors ${
                          isSelected
                            ? "border-[var(--color-theme-accent)] bg-[var(--color-theme-surface-hover)] font-semibold text-[var(--color-theme-text)]"
                            : day.isCurrentMonth
                              ? "border-transparent text-[var(--color-theme-text)] hover:bg-[var(--color-theme-surface-hover)]"
                              : "border-transparent text-[var(--color-theme-text-subtle)] hover:bg-[var(--color-theme-surface-hover)]"
                        }`}
                        onClick={() =>
                          handleSelect(mode === "week" ? getWeekStartKey(day.dateKey) : day.dateKey)
                        }
                      >
                        <span>{day.dayOfMonth}</span>
                        {isToday ? (
                          <span className="lx-datepicker-today-dot absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--color-theme-accent)]" />
                        ) : null}
                        {entryCount > 0 ? (
                          <span className="lx-datepicker-badge absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-theme-accent)] px-0.5 text-xs font-bold leading-none text-[var(--color-theme-bg)]">
                            {entryCount > BADGE_MAX_COUNT ? `${BADGE_MAX_COUNT}+` : entryCount}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>

                {quickSelects ? (
                  <div className="mt-3 flex items-center gap-1 border-t border-[var(--color-theme-border)] pt-2">
                    {QUICK_SELECTS.map((quickSelect) => {
                      const quickDateKey = shiftDateKey(todayKey, quickSelect.offset)
                      const isSelected = quickDateKey === value
                      return (
                        <button
                          key={quickSelect.labelKey}
                          type="button"
                          aria-pressed={isSelected}
                          className={`lx-datepicker-quick flex h-6 flex-1 items-center justify-center rounded-[4px] text-xs transition-colors ${
                            isSelected
                              ? "bg-[var(--color-theme-surface-hover)] font-semibold text-[var(--color-theme-text)]"
                              : "text-[var(--color-theme-text-muted)] hover:bg-[var(--color-theme-surface-hover)] hover:text-[var(--color-theme-text)]"
                          }`}
                          onClick={() => handleSelect(quickDateKey)}
                        >
                          {t(quickSelect.labelKey)}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
