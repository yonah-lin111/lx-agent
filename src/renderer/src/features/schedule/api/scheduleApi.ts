import type {
  CreateScheduleItemInput,
  ReorderScheduleItemsInput,
  ScheduleDayStats,
  ScheduleItem,
  ScheduleRangeStatsInput,
  UpdateScheduleItemInput,
} from "@shared/contracts/schedule"

// 日程写操作广播事件名：多实例（顶部栏面板 / 日程页）据此同步刷新。
export const SCHEDULE_CHANGED_EVENT = "schedule:changed"

// 同一微任务批次内的多次写操作（如批量顺延）合并为一次广播。
let isNotifyScheduled = false

const notifyScheduleChanged = (): void => {
  if (isNotifyScheduled) return
  isNotifyScheduled = true
  queueMicrotask(() => {
    isNotifyScheduled = false
    window.dispatchEvent(new CustomEvent(SCHEDULE_CHANGED_EVENT))
  })
}

/**
 * 隔离日程对 Electron preload API 的直接依赖。
 */
export const scheduleApi = {
  listByDate: (entryDate: string): Promise<ScheduleItem[]> =>
    window.api.schedule.listByDate({ entryDate }),
  create: async (input: CreateScheduleItemInput): Promise<ScheduleItem> => {
    const created = await window.api.schedule.create(input)
    notifyScheduleChanged()
    return created
  },
  update: async (input: UpdateScheduleItemInput): Promise<ScheduleItem> => {
    const updated = await window.api.schedule.update(input)
    notifyScheduleChanged()
    return updated
  },
  remove: async (id: number): Promise<void> => {
    await window.api.schedule.remove(id)
    notifyScheduleChanged()
  },
  reorder: async (input: ReorderScheduleItemsInput): Promise<void> => {
    await window.api.schedule.reorder(input)
    notifyScheduleChanged()
  },
  listRangeStats: (input: ScheduleRangeStatsInput): Promise<ScheduleDayStats[]> =>
    window.api.schedule.listRangeStats(input),
}
