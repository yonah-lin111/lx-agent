import type { DailyActivity } from "@shared/contracts/activity"

/**
 * 隔离活动数据对 Electron preload API 的直接依赖。
 */
export const activityApi = {
  getDaily: (): Promise<DailyActivity[]> => window.api.activity.getDaily(),
}
