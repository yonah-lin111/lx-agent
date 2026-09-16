import type { ScheduleDayStats, ScheduleItem, SchedulePriority } from "@shared/contracts/schedule"
import { getRecentRange, shiftDateKey } from "@/lib/date"
import { SCHEDULE_PRIORITY_SEQUENCE } from "./constants"
import type { SchedulePriorityCounts } from "./types"

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
