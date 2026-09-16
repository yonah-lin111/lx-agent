import type { ScheduleDayStats, ScheduleItem, SchedulePriority } from "@shared/contracts/schedule"
import {
  formatWeekdayShort,
  getRecentRange,
  getWeekStartKey,
  parseDateKey,
  shiftDateKey,
} from "@/lib/date"
import { SCHEDULE_PRIORITY_SEQUENCE } from "./constants"
import type { SchedulePriorityCounts, ScheduleStatusFilter, ScheduleWeekDay } from "./types"

/**
 * 计算下一个优先级（P3 回绕到 P0）。
 */
export const getNextPriority = (priority: SchedulePriority): SchedulePriority => {
  const index = SCHEDULE_PRIORITY_SEQUENCE.indexOf(priority)
  return SCHEDULE_PRIORITY_SEQUENCE[(index + 1) % SCHEDULE_PRIORITY_SEQUENCE.length]
}

/**
 * 一键重排顺序：未完成优先 → P0..P3 → 原排序值 → id（稳定兜底）。
 */
export const sortScheduleItems = (items: ScheduleItem[]): ScheduleItem[] =>
  [...items].sort((left, right) => {
    if (left.completed !== right.completed) return left.completed ? 1 : -1

    const priorityDiff =
      SCHEDULE_PRIORITY_SEQUENCE.indexOf(left.priority) -
      SCHEDULE_PRIORITY_SEQUENCE.indexOf(right.priority)
    if (priorityDiff !== 0) return priorityDiff
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
    return left.id - right.id
  })

/**
 * 统计各优先级条目数。
 */
export const countByPriority = (items: ScheduleItem[]): SchedulePriorityCounts => {
  const counts: SchedulePriorityCounts = { P0: 0, P1: 0, P2: 0, P3: 0 }
  for (const item of items) counts[item.priority] += 1
  return counts
}

/**
 * 完成率（0-100 整数，空列表为 0）。
 */
export const getCompletionRate = (items: ScheduleItem[]): number => {
  if (items.length === 0) return 0
  const completedCount = items.filter((item) => item.completed).length
  return Math.round((completedCount / items.length) * 100)
}

/**
 * 以 endDateKey 为终点补齐最近 days 天的统计（缺失日期按 0 计），用于趋势图。
 */
export const fillRecentStats = (
  stats: ScheduleDayStats[],
  endDateKey: string,
  days: number,
): ScheduleDayStats[] => {
  const { startDate } = getRecentRange(endDateKey, days)
  const statsByDate = new Map(stats.map((entry) => [entry.date, entry]))

  return Array.from({ length: days }, (_, index) => {
    const date = shiftDateKey(startDate, index)
    return statsByDate.get(date) ?? { date, plannedCount: 0, completedCount: 0 }
  })
}

/**
 * 计算指定日期所在周（周一至周日）的起始与截止日期。
 */
export const getWeekStartAndEnd = (dateKey: string): { startDate: string; endDate: string } => {
  const startDate = getWeekStartKey(dateKey)
  const endDate = shiftDateKey(startDate, 6)
  return { startDate, endDate }
}

/**
 * 生成指定日期所在周（周一至周日）的 7 天视图模型。
 */
export const getWeekDates = (
  selectedDateKey: string,
  todayKey: string,
  locale: string,
  statsMap: Record<string, { plannedCount: number; completedCount: number }> = {},
): ScheduleWeekDay[] => {
  const weekStart = getWeekStartKey(selectedDateKey)
  return Array.from({ length: 7 }, (_, index) => {
    const dateKey = shiftDateKey(weekStart, index)
    const dayOfMonth = parseDateKey(dateKey).getDate()
    const weekdayLabel = formatWeekdayShort(dateKey, locale)
    const stats = statsMap[dateKey]
    return {
      dateKey,
      dayOfMonth,
      weekdayLabel,
      isToday: dateKey === todayKey,
      isSelected: dateKey === selectedDateKey,
      entryCount: stats?.plannedCount ?? 0,
      completedCount: stats?.completedCount ?? 0,
    }
  })
}

/**
 * 按完成状态过滤待办列表。
 */
export const filterScheduleItems = (
  items: ScheduleItem[],
  filter: ScheduleStatusFilter,
): ScheduleItem[] => {
  if (filter === "pending") return items.filter((item) => !item.completed)
  if (filter === "completed") return items.filter((item) => item.completed)
  return items
}

/**
 * 按优先级将待办条目归类为四象限分组。
 */
export const groupItemsByPriority = (
  items: ScheduleItem[],
): Record<SchedulePriority, ScheduleItem[]> => {
  const groups: Record<SchedulePriority, ScheduleItem[]> = {
    P0: [],
    P1: [],
    P2: [],
    P3: [],
  }
  for (const item of items) {
    groups[item.priority].push(item)
  }
  return groups
}
