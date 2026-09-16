// 日程领域契约：单日待办条目的增删改查、跨日移动与区间统计。

// 日程优先级（四档，P0 最高）。
export type SchedulePriority = "P0" | "P1" | "P2" | "P3"

// 单条日程条目。
export interface ScheduleItem {
  id: number
  // 归属日期（本地日期，YYYY-MM-DD）。
  entryDate: string
  content: string
  priority: SchedulePriority
  completed: boolean
  // 完成发生的本地日期；未完成时为 null。
  completedDate: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// 按日查询输入。
export interface ListScheduleItemsInput {
  entryDate: string
}

// 新建条目输入。
export interface CreateScheduleItemInput {
  entryDate: string
  content: string
  priority?: SchedulePriority
}

// 更新条目输入（仅传需要变更的字段）。
export interface UpdateScheduleItemInput {
  id: number
  content?: string
  priority?: SchedulePriority
  completed?: boolean
  // 移动条目到目标日期。
  entryDate?: string
}

// 一键重排输入：ids 为目标顺序（仅允许包含该日期下的条目）。
export interface ReorderScheduleItemsInput {
  entryDate: string
  ids: number[]
}

// 区间统计输入（含首尾日期）。
export interface ScheduleRangeStatsInput {
  startDate: string
  endDate: string
}

// 单日统计：当日计划条目数与完成条目数。
export interface ScheduleDayStats {
  date: string
  plannedCount: number
  completedCount: number
}

// 日程领域 preload API 契约。
export interface ScheduleApi {
  schedule: {
    listByDate: (input: ListScheduleItemsInput) => Promise<ScheduleItem[]>
    create: (input: CreateScheduleItemInput) => Promise<ScheduleItem>
    update: (input: UpdateScheduleItemInput) => Promise<ScheduleItem>
    remove: (id: number) => Promise<void>
    reorder: (input: ReorderScheduleItemsInput) => Promise<void>
    listRangeStats: (input: ScheduleRangeStatsInput) => Promise<ScheduleDayStats[]>
  }
}
