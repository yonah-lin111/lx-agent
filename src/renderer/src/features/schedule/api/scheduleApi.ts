import type {
  CreateScheduleItemInput,
  ReorderScheduleItemsInput,
  ScheduleDayStats,
  ScheduleItem,
  ScheduleRangeStatsInput,
  UpdateScheduleItemInput,
} from "@shared/contracts/schedule"

/**
 * 隔离日程对 Electron preload API 的直接依赖。
 */
export const scheduleApi = {
  listByDate: (entryDate: string): Promise<ScheduleItem[]> =>
    window.api.schedule.listByDate({ entryDate }),
  create: (input: CreateScheduleItemInput): Promise<ScheduleItem> =>
    window.api.schedule.create(input),
  update: (input: UpdateScheduleItemInput): Promise<ScheduleItem> =>
    window.api.schedule.update(input),
  remove: (id: number): Promise<void> => window.api.schedule.remove(id),
  reorder: (input: ReorderScheduleItemsInput): Promise<void> => window.api.schedule.reorder(input),
  listRangeStats: (input: ScheduleRangeStatsInput): Promise<ScheduleDayStats[]> =>
    window.api.schedule.listRangeStats(input),
}
