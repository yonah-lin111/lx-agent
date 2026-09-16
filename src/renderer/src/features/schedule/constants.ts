import type { SchedulePriority } from "@shared/contracts/schedule"

// 优先级顺序（P0 最高），用于循环切换与一键重排。
export const SCHEDULE_PRIORITY_SEQUENCE: readonly SchedulePriority[] = ["P0", "P1", "P2", "P3"]

// 优先级展示色：引用主题级 CSS 变量，随主题切换自动生效。
export const SCHEDULE_PRIORITY_COLORS: Record<SchedulePriority, string> = {
  P0: "var(--color-schedule-priority-p0)",
  P1: "var(--color-schedule-priority-p1)",
  P2: "var(--color-schedule-priority-p2)",
  P3: "var(--color-schedule-priority-p3)",
}

// 趋势图配色：引用主题级 CSS 变量。
export const SCHEDULE_CHART_COLORS = {
  planned: "var(--color-schedule-chart-planned)",
  completed: "var(--color-schedule-chart-completed)",
} as const

// 趋势图展示天数。
export const SCHEDULE_TREND_DAYS = 7
