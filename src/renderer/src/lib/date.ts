// 本地日期工具：全部以 YYYY-MM-DD / YYYY-MM 字符串为口径，避免 UTC 换算导致的跨日漂移。

// 本地日期键格式。
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// 月份键格式。
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/

// 日历网格单元格。
export interface MonthGridDay {
  dateKey: string
  dayOfMonth: number
  isCurrentMonth: boolean
}

// 日期区间（含首尾）。
export interface DateRange {
  startDate: string
  endDate: string
}

/**
 * Date → 本地日期键（YYYY-MM-DD）。
 */
export const toDateKey = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * 今天的本地日期键。
 */
export const getTodayKey = (): string => toDateKey(new Date())

/**
 * 日期键 → 本地零点 Date；非法格式返回 Invalid Date。
 */
export const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split("-").map((part) => Number.parseInt(part, 10))
  return new Date(year, month - 1, day)
}

/**
 * 是否为真实存在的本地日期键（拒绝 2026-02-30 这类溢出值）。
 */
export const isValidDateKey = (dateKey: string): boolean => {
  if (!DATE_KEY_PATTERN.test(dateKey)) return false
  return toDateKey(parseDateKey(dateKey)) === dateKey
}

/**
 * 日期键按天偏移。
 */
export const shiftDateKey = (dateKey: string, days: number): string => {
  const date = parseDateKey(dateKey)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

/**
 * 日期键 → 月份键（YYYY-MM）。
 */
export const getMonthKey = (dateKey: string): string => dateKey.slice(0, 7)

/**
 * 月份键按月偏移（跨年安全）。
 */
export const shiftMonthKey = (monthKey: string, months: number): string => {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10))
  return toDateKey(new Date(year, month - 1 + months, 1)).slice(0, 7)
}

/**
 * 是否为月份键格式。
 */
export const isValidMonthKey = (monthKey: string): boolean => MONTH_KEY_PATTERN.test(monthKey)

/**
 * 月份键 → 该月首尾日期键。
 */
export const getMonthRange = (monthKey: string): DateRange => {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10))
  const lastDay = new Date(year, month, 0).getDate()
  return { startDate: `${monthKey}-01`, endDate: `${monthKey}-${String(lastDay).padStart(2, "0")}` }
}

/**
 * 以 endDateKey 为终点、向前 days 天的日期区间（含终点）。
 */
export const getRecentRange = (endDateKey: string, days: number): DateRange => ({
  startDate: shiftDateKey(endDateKey, -(days - 1)),
  endDate: endDateKey,
})

/**
 * 日期键所在周的周一日期键（周一起始）。
 */
export const getWeekStartKey = (dateKey: string): string => {
  const date = parseDateKey(dateKey)
  const mondayOffset = (date.getDay() + 6) % 7
  return shiftDateKey(dateKey, -mondayOffset)
}

/**
 * 月份键 → 42 天（6 行）日历网格，周一起始，含上下月补位。
 */
export const getMonthGrid = (monthKey: string): MonthGridDay[] => {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10))
  const firstDay = new Date(year, month - 1, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(year, month - 1, 1 - startOffset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    )
    return {
      dateKey: toDateKey(date),
      dayOfMonth: date.getDate(),
      isCurrentMonth: date.getMonth() === month - 1,
    }
  })
}

/**
 * 中文 / 英文等多语言日期标签（按 locale 输出）。
 */
export const formatDateLabel = (dateKey: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(
    parseDateKey(dateKey),
  )

/**
 * 月份标签（如 2026年9月 / September 2026）。
 */
export const formatMonthLabel = (monthKey: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
    parseDateKey(`${monthKey}-01`),
  )

/**
 * 日期键 → 短周几标签（如 周一 / Mon）。
 */
export const formatWeekdayShort = (dateKey: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: "short" }).format(parseDateKey(dateKey))

/**
 * 周一对齐的 7 个短周几标签。
 */
export const getWeekdayLabels = (locale: string): string[] => {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" })
  // 2024-01-01 为周一，作为固定锚点生成周一起始序列。
  return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(2024, 0, 1 + index)))
}

/**
 * 日期键 → 短日期标签（趋势图 X 轴，如 9/16）。
 */
export const formatDayOfMonth = (dateKey: string): string => {
  const date = parseDateKey(dateKey)
  return `${date.getMonth() + 1}/${date.getDate()}`
}
