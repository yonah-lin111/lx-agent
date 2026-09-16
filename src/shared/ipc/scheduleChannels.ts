// 日程领域 IPC channel 常量。
export const SCHEDULE_CHANNELS = {
  listByDate: "schedule:listByDate",
  create: "schedule:create",
  update: "schedule:update",
  remove: "schedule:remove",
  reorder: "schedule:reorder",
  listRangeStats: "schedule:listRangeStats",
} as const
