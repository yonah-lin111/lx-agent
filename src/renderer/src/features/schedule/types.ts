import type { SchedulePriority, UpdateScheduleItemInput } from "@shared/contracts/schedule"

export type {
  CreateScheduleItemInput,
  ListScheduleItemsInput,
  ReorderScheduleItemsInput,
  ScheduleApi,
  ScheduleDayStats,
  ScheduleItem,
  SchedulePriority,
  ScheduleRangeStatsInput,
  UpdateScheduleItemInput,
} from "@shared/contracts/schedule"

// 更新补丁（id 由调用点补齐）。
export type ScheduleItemPatch = Omit<UpdateScheduleItemInput, "id">

// 各优先级条目数映射。
export type SchedulePriorityCounts = Record<SchedulePriority, number>

// 工作台视图模式：清单时间流 vs 四象限看板。
export type ScheduleViewMode = "list" | "matrix"

// 待办完成状态过滤：全部 / 仅待完成 / 仅已完成。
export type ScheduleStatusFilter = "all" | "pending" | "completed"

// 周透视感知带中的单日模型。
export interface ScheduleWeekDay {
  dateKey: string
  dayOfMonth: number
  weekdayLabel: string
  isToday: boolean
  isSelected: boolean
  entryCount: number
  completedCount: number
}
