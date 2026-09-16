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
