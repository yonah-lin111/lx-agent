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
  type DateRange,
  formatDateLabel,
  formatDateRangeLabel,
  formatMonthLabel,
  getMonthGrid,
  getMonthKey,
  getTodayKey,
  getWeekdayLabels,
  getWeekStartKey,
  isValidDateKey,
  isValidMonthKey,
  type MonthGridDay,
  shiftDateKey,
  shiftMonthKey,
} from "@/lib/date"

// 选择模式：按日 / 按周（值为周一日期键）/ 按月（值为 YYYY-MM）/ 按区间（双月历）。
export type LxDatePickerMode = "date" | "week" | "month" | "range"

// 触发器尺寸档位：仅触发器与两侧切换按钮缩放，弹层容器不随之变化。
export type LxDatePickerSize = "small" | "medium" | "large"

// 区间预设项：数据由调用方提供，组件只渲染文案并回传 key。
export interface LxDateRangePreset {
  key: string
  label: string
}

// 各模式共用属性。
interface LxDatePickerBaseProps {
  placeholder?: string
  className?: string
  triggerClassName?: string
  // 自定义触发器；缺省时渲染内置日期按钮。
  children?: React.ReactNode
  disabled?: boolean
  // 每日条目数角标（仅 date 模式展示）。
  entryCountMap?: Record<string, number>
  // 可见月份变化回调（供调用方按需加载月历角标）。
  onVisibleMonthChange?: (monthKey: string) => void
  // 是否展示快捷项（今天 / 昨天 / 明天），默认展示。
  quickSelects?: boolean
  // 内联模式：直接渲染日历面板（无触发器与弹层），供外层浮层（如 LxTooltip）承载。
  inline?: boolean
  // 是否展示内置触发器前置日历图标，默认展示；自定义触发器不受影响。
  showIcon?: boolean
  // 是否在触发器两侧渲染前一 / 后一周期切换按钮，默认不展示（区间模式不支持）。
  showNavButtons?: boolean
  // 触发器尺寸档位，默认 medium。
  size?: LxDatePickerSize
  // 触发器文案覆盖（区间模式用于展示调用方预设名）。
  triggerLabel?: string
}

// 单日 / 周 / 月模式属性。
interface LxDatePickerSingleProps extends LxDatePickerBaseProps {
  mode?: "date" | "week" | "month"
  // 当前值：date/week 为 YYYY-MM-DD，month 为 YYYY-MM。
  value: string
  // 选择回调。
  onChange: (value: string) => void
}

// 区间模式属性：端点受控，预设数据由调用方提供。
interface LxDateRangePickerProps extends LxDatePickerBaseProps {
  mode: "range"
  // 已确认区间；null 表示无日期边界（如「全部时间」）。
  rangeValue: DateRange | null
  // 区间确认回调（双端点齐备时触发）。
  onRangeChange: (range: DateRange) => void
  presets?: LxDateRangePreset[]
  activePresetKey?: string | null
  onPresetSelect?: (key: string) => void
}

// 日期选择器属性。
export type LxDatePickerProps = LxDatePickerSingleProps | LxDateRangePickerProps

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
const RANGE_POPOVER_FALLBACK_WIDTH = 576

// 尺寸阶梯：medium 与历史观感一致；small / large 对齐 LxSelect 的档位高度。
const SIZE_TRIGGER_CLASSES: Record<LxDatePickerSize, string> = {
  small: "h-6 px-2 text-xs",
  medium: "h-7 px-2.5 text-xs",
  large: "h-8 px-3 text-sm",
}

const SIZE_ICON_CLASSES: Record<LxDatePickerSize, string> = {
  small: "h-3 w-3",
  medium: "h-3.5 w-3.5",
  large: "h-4 w-4",
}

const SIZE_NAV_BUTTON_CLASSES: Record<LxDatePickerSize, string> = {
  small: "h-6 w-6",
  medium: "h-7 w-7",
  large: "h-8 w-8",
}

// 两侧切换按钮基础样式（外观与触发器一致）。
const NAV_BUTTON_CLASSES =
  "lx-datepicker-nav-button flex shrink-0 items-center justify-center rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border-strong)] bg-[var(--color-theme-surface)] text-[var(--color-theme-text-muted)] transition-colors hover:bg-[var(--color-theme-surface-hover)] hover:text-[var(--color-theme-text)] disabled:cursor-not-allowed disabled:opacity-40"

// 预设缺省值，避免每次渲染重建数组。
const EMPTY_RANGE_PRESETS: LxDateRangePreset[] = []

// 日历单元格属性：单日面板与区间面板共用。
interface CalendarDayButtonProps {
  day: MonthGridDay
  locale: string
  isSelected: boolean
  inRange: boolean
  entryCount?: number
  onSelect: () => void
}

/**
 * 渲染单个日历单元格：选中 / 区间内 / 非当前月三态与今日圆点、条目角标。
 */
const CalendarDayButton = ({
  day,
  locale,
  isSelected,
  inRange,
  entryCount = 0,
  onSelect,
}: CalendarDayButtonProps): React.JSX.Element => {
  const isToday = day.dateKey === getTodayKey()

  return (
    <button
      type="button"
      aria-label={formatDateLabel(day.dateKey, locale)}
      aria-pressed={isSelected}
      data-date={day.dateKey}
      data-today={isToday ? "true" : undefined}
      data-outside={day.isCurrentMonth ? undefined : "true"}
      className={`lx-datepicker-day relative flex aspect-square w-full items-center justify-center rounded-[4px] border text-xs transition-colors ${
        isSelected
          ? "border-[var(--color-theme-accent)] bg-[var(--color-theme-surface-hover)] font-semibold text-[var(--color-theme-text)]"
          : inRange
            ? "lx-datepicker-range border-transparent bg-[var(--color-theme-surface-hover)] text-[var(--color-theme-text)]"
            : day.isCurrentMonth
              ? "border-transparent text-[var(--color-theme-text)] hover:bg-[var(--color-theme-surface-hover)]"
              : "border-transparent text-[var(--color-theme-text-subtle)] hover:bg-[var(--color-theme-surface-hover)]"
      }`}
      onClick={onSelect}
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
}

// 日历面板属性：弹层与内联两种形态共用同一面板实现。
interface DatePickerPanelProps {
  mode: Exclude<LxDatePickerMode, "range">
  value: string
  entryCountMap?: Record<string, number>
  onSelect: (value: string) => void
  onVisibleMonthChange?: (monthKey: string) => void
  quickSelects: boolean
}

/**
 * 渲染日历面板内容（标题、月历网格、快捷项），不含卡片外观，由调用方决定承载方式。
 */
const DatePickerPanel = ({
  mode,
  value,
  entryCountMap,
  onSelect,
  onVisibleMonthChange,
  quickSelects,
}: DatePickerPanelProps): React.JSX.Element => {
  const { t, locale } = useTranslation()
  const todayKey = getTodayKey()
  const [visibleMonth, setVisibleMonth] = useState<string>(() => {
    if (mode === "month" && isValidMonthKey(value)) return value
    return getMonthKey(isValidDateKey(value) ? value : todayKey)
  })
  const [visibleYear, setVisibleYear] = useState<number>(() =>
    Number.parseInt(visibleMonth.slice(0, 4), 10),
  )

  const gridDays = useMemo(() => getMonthGrid(visibleMonth), [visibleMonth])
  const weekdayLabels = useMemo(() => getWeekdayLabels(locale), [locale])

  // 外部值变化时同步可见月份 / 年份。
  useEffect(() => {
    if (mode === "month") {
      if (isValidMonthKey(value)) setVisibleYear(Number.parseInt(value.slice(0, 4), 10))
      return
    }
    if (isValidDateKey(value)) setVisibleMonth(getMonthKey(value))
  }, [value, mode])

  // 面板挂载或切换月份时上报可见月份。
  useEffect(() => {
    if (mode !== "month") onVisibleMonthChange?.(visibleMonth)
  }, [mode, visibleMonth, onVisibleMonthChange])

  const handleSelect = (nextValue: string): void => {
    onSelect(nextValue)
  }

  if (mode === "month") {
    return (
      <>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="lx-datepicker-caption truncate text-xs uppercase tracking-[0.18em] text-[var(--color-theme-text-subtle)]">
              {t("common.datePicker.selectMonth")}
            </p>
            <p className="text-sm font-semibold text-[var(--color-theme-text)]">{visibleYear}</p>
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
    )
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="lx-datepicker-caption truncate text-xs uppercase tracking-[0.18em] text-[var(--color-theme-text-subtle)]">
            {t(mode === "week" ? "common.datePicker.selectWeek" : "common.datePicker.selectDate")}
          </p>
          <p className="truncate text-sm font-semibold text-[var(--color-theme-text)]">
            {formatMonthLabel(visibleMonth, locale)}
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
        {gridDays.map((day) => (
          <CalendarDayButton
            key={day.dateKey}
            day={day}
            locale={locale}
            isSelected={
              mode === "week" ? getWeekStartKey(day.dateKey) === value : day.dateKey === value
            }
            inRange={false}
            entryCount={entryCountMap?.[day.dateKey] ?? 0}
            onSelect={() =>
              handleSelect(mode === "week" ? getWeekStartKey(day.dateKey) : day.dateKey)
            }
          />
        ))}
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
  )
}

// 区间面板属性：双月历与预设行。
interface DateRangePanelProps {
  rangeValue: DateRange | null
  presets: LxDateRangePreset[]
  activePresetKey: string | null
  onSelectRange: (range: DateRange) => void
  onPresetSelect?: (key: string) => void
}

/**
 * 渲染双月历区间面板：首次点击记起点，第二次点击确认区间（逆序自动交换）。
 */
const DateRangePanel = ({
  rangeValue,
  presets,
  activePresetKey,
  onSelectRange,
  onPresetSelect,
}: DateRangePanelProps): React.JSX.Element => {
  const { t, locale } = useTranslation()
  const [visibleMonth, setVisibleMonth] = useState<string>(() =>
    getMonthKey(rangeValue?.startDate ?? getTodayKey()),
  )
  const [pendingStart, setPendingStart] = useState<string | null>(null)

  // 外部区间变化时同步可见月份。
  useEffect(() => {
    if (rangeValue) setVisibleMonth(getMonthKey(rangeValue.startDate))
  }, [rangeValue])

  const rightMonth = shiftMonthKey(visibleMonth, 1)
  const leftDays = useMemo(() => getMonthGrid(visibleMonth), [visibleMonth])
  const rightDays = useMemo(() => getMonthGrid(rightMonth), [rightMonth])
  const weekdayLabels = useMemo(() => getWeekdayLabels(locale), [locale])

  // 待定起点优先于已确认区间展示：首次点击后隐藏旧区间的终点。
  const activeStart = pendingStart ?? rangeValue?.startDate ?? null
  const activeEnd = pendingStart === null ? (rangeValue?.endDate ?? null) : null

  const handleDaySelect = (dateKey: string): void => {
    if (pendingStart === null) {
      setPendingStart(dateKey)
      return
    }
    setPendingStart(null)
    onSelectRange(
      pendingStart <= dateKey
        ? { startDate: pendingStart, endDate: dateKey }
        : { startDate: dateKey, endDate: pendingStart },
    )
  }

  const renderMonth = (monthKey: string, days: MonthGridDay[]): React.JSX.Element => (
    <div className="lx-datepicker-month-grid">
      <p className="mb-1 text-center text-xs font-medium text-[var(--color-theme-text-muted)]">
        {formatMonthLabel(monthKey, locale)}
      </p>
      <div className="grid grid-cols-7 gap-1">
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
        {days.map((day) => (
          <CalendarDayButton
            key={day.dateKey}
            day={day}
            locale={locale}
            isSelected={day.dateKey === activeStart || day.dateKey === activeEnd}
            inRange={
              activeStart !== null &&
              activeEnd !== null &&
              day.dateKey > activeStart &&
              day.dateKey < activeEnd
            }
            onSelect={() => handleDaySelect(day.dateKey)}
          />
        ))}
      </div>
    </div>
  )

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="lx-datepicker-caption truncate text-xs uppercase tracking-[0.18em] text-[var(--color-theme-text-subtle)]">
            {t("common.datePicker.selectRange")}
          </p>
          <p className="truncate text-sm font-semibold text-[var(--color-theme-text)]">
            {rangeValue
              ? formatDateRangeLabel(rangeValue.startDate, rangeValue.endDate, locale)
              : formatMonthLabel(visibleMonth, locale)}
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

      <div className="mt-3 grid grid-cols-2 gap-3">
        {renderMonth(visibleMonth, leftDays)}
        {renderMonth(rightMonth, rightDays)}
      </div>

      {presets.length > 0 ? (
        <div className="mt-3 flex items-center gap-1 border-t border-[var(--color-theme-border)] pt-2">
          {presets.map((preset) => {
            const isSelected = preset.key === activePresetKey
            return (
              <button
                key={preset.key}
                type="button"
                aria-pressed={isSelected}
                className={`lx-datepicker-quick flex h-6 flex-1 items-center justify-center rounded-[4px] text-xs transition-colors ${
                  isSelected
                    ? "bg-[var(--color-theme-surface-hover)] font-semibold text-[var(--color-theme-text)]"
                    : "text-[var(--color-theme-text-muted)] hover:bg-[var(--color-theme-surface-hover)] hover:text-[var(--color-theme-text)]"
                }`}
                onClick={() => onPresetSelect?.(preset.key)}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </>
  )
}

/**
 * 渲染支持按日 / 按周 / 按月三态、区间双月历与每日角标的日期选择器。
 * popover 形态（默认）经 portal 定位展开；inline 形态直接渲染面板供外层浮层承载。
 * 颜色全部走主题 token，像素等主题通过 .lx-datepicker-* 类名挂钩覆盖。
 */
export const LxDatePicker = (props: LxDatePickerProps): React.JSX.Element => {
  const { t, locale } = useTranslation()
  const {
    placeholder,
    className = "",
    triggerClassName = "",
    children,
    disabled = false,
    entryCountMap,
    onVisibleMonthChange,
    quickSelects = true,
    inline = false,
    showIcon = true,
    showNavButtons = false,
    size = "medium",
    triggerLabel,
  } = props
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  // 弹层定位锚定触发器本身（而非含切换按钮的整组），避免按钮占位导致弹层偏移。
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // 挂载 / 退场状态机与外部关闭（点击外部、Esc、滚动）。inline 形态无浮层，跳过。
  const { shouldRender, isAnimatingOut } = useLayerPresence(isOpen && !inline)
  useFloatingLayer({
    isOpen: isOpen && !inline,
    active: shouldRender,
    rootRef: popoverRef,
    insideRefs: [containerRef],
    anchorRef: containerRef,
    onClose: () => setIsOpen(false),
  })

  // 弹层按触发元素视口坐标定位（上下翻转 + 边界夹取），随视口尺寸变化重算。
  useLayoutEffect(() => {
    if (inline || !shouldRender) return
    const updatePosition = (): void => {
      const trigger = anchorRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const width =
        popoverRef.current?.offsetWidth ??
        (props.mode === "range" ? RANGE_POPOVER_FALLBACK_WIDTH : POPOVER_FALLBACK_WIDTH)
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
  }, [inline, shouldRender, props.mode])

  const handleToggle = (): void => {
    if (disabled) return
    setIsOpen((previous) => !previous)
  }

  const handleSingleSelect = (nextValue: string): void => {
    setIsOpen(false)
    if (props.mode !== "range") props.onChange(nextValue)
  }

  const handleRangeSelect = (range: DateRange): void => {
    setIsOpen(false)
    if (props.mode === "range") props.onRangeChange(range)
  }

  const handlePresetSelect = (key: string): void => {
    setIsOpen(false)
    if (props.mode === "range") props.onPresetSelect?.(key)
  }

  // 两侧切换按钮：按模式平移一个周期（date ±1 天 / week ±7 天 / month ±1 月）。
  const shiftPeriod = (direction: -1 | 1): void => {
    if (props.mode === "range") return
    if (props.mode === "month") {
      if (isValidMonthKey(props.value)) props.onChange(shiftMonthKey(props.value, direction))
      return
    }
    if (!isValidDateKey(props.value)) return
    props.onChange(shiftDateKey(props.value, props.mode === "week" ? direction * 7 : direction))
  }

  const navLabelKeys: { previous: TranslationKey; next: TranslationKey } =
    props.mode === "month"
      ? { previous: "common.datePicker.previousMonth", next: "common.datePicker.nextMonth" }
      : props.mode === "week"
        ? { previous: "common.datePicker.previousWeek", next: "common.datePicker.nextWeek" }
        : { previous: "common.datePicker.previousDay", next: "common.datePicker.nextDay" }

  const shouldShowNavButtons = showNavButtons && props.mode !== "range"

  const displayLabel = (): string => {
    const fallbackLabel = placeholder ?? t("common.datePicker.placeholder")
    if (props.mode === "range") {
      if (triggerLabel) return triggerLabel
      return props.rangeValue
        ? formatDateRangeLabel(props.rangeValue.startDate, props.rangeValue.endDate, locale)
        : fallbackLabel
    }
    if (props.mode === "month") {
      return isValidMonthKey(props.value) ? formatMonthLabel(props.value, locale) : fallbackLabel
    }
    return isValidDateKey(props.value) ? formatDateLabel(props.value, locale) : fallbackLabel
  }

  const renderPanel = (closeOnSelect: boolean): React.JSX.Element =>
    props.mode === "range" ? (
      <DateRangePanel
        rangeValue={props.rangeValue}
        presets={props.presets ?? EMPTY_RANGE_PRESETS}
        activePresetKey={props.activePresetKey ?? null}
        onSelectRange={closeOnSelect ? handleRangeSelect : props.onRangeChange}
        onPresetSelect={closeOnSelect ? handlePresetSelect : props.onPresetSelect}
      />
    ) : (
      <DatePickerPanel
        mode={props.mode ?? "date"}
        value={props.value}
        entryCountMap={entryCountMap}
        quickSelects={quickSelects}
        onSelect={closeOnSelect ? handleSingleSelect : props.onChange}
        onVisibleMonthChange={onVisibleMonthChange}
      />
    )

  if (inline) {
    return <div className={`lx-datepicker-inline ${className}`}>{renderPanel(false)}</div>
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
        className={`lx-datepicker-trigger flex w-full items-center gap-1.5 rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border-strong)] bg-[var(--color-theme-surface)] text-left text-[var(--color-theme-text)] outline-none transition-colors duration-150 hover:bg-[var(--color-theme-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 ${SIZE_TRIGGER_CLASSES[size]} ${triggerClassName}`}
        onClick={handleToggle}
      >
        {showIcon ? (
          <CalendarDays
            className={`lx-datepicker-trigger-icon shrink-0 text-[var(--color-theme-text-muted)] ${SIZE_ICON_CLASSES[size]}`}
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{displayLabel()}</span>
        <ChevronDown
          className={`shrink-0 text-[var(--color-theme-text-subtle)] transition-transform duration-150 ${SIZE_ICON_CLASSES[size]} ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
    )
  })()

  return (
    <div ref={containerRef} className={`relative inline-flex items-center gap-1.5 ${className}`}>
      {shouldShowNavButtons ? (
        <button
          type="button"
          disabled={disabled}
          aria-label={t(navLabelKeys.previous)}
          className={`${NAV_BUTTON_CLASSES} ${SIZE_NAV_BUTTON_CLASSES[size]}`}
          onClick={() => shiftPeriod(-1)}
        >
          <ChevronLeft className={SIZE_ICON_CLASSES[size]} />
        </button>
      ) : null}

      <div ref={anchorRef} className="min-w-0 flex-1">
        {triggerElement}
      </div>

      {shouldShowNavButtons ? (
        <button
          type="button"
          disabled={disabled}
          aria-label={t(navLabelKeys.next)}
          className={`${NAV_BUTTON_CLASSES} ${SIZE_NAV_BUTTON_CLASSES[size]}`}
          onClick={() => shiftPeriod(1)}
        >
          <ChevronRight className={SIZE_ICON_CLASSES[size]} />
        </button>
      ) : null}

      {shouldRender &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={t(
              props.mode === "week"
                ? "common.datePicker.selectWeek"
                : props.mode === "month"
                  ? "common.datePicker.selectMonth"
                  : props.mode === "range"
                    ? "common.datePicker.selectRange"
                    : "common.datePicker.selectDate",
            )}
            data-mode={props.mode ?? "date"}
            className={`lx-datepicker fixed z-[9999] rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border-strong)] bg-[var(--color-theme-surface)] p-3 text-[var(--color-theme-text)] shadow-[0_18px_60px_rgba(0,0,0,0.55)] ${
              props.mode === "range" ? "w-[576px]" : "w-[292px]"
            } ${isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"}`}
            style={{ ...(popoverPosition ?? undefined) }}
          >
            {renderPanel(true)}
          </div>,
          document.body,
        )}
    </div>
  )
}
