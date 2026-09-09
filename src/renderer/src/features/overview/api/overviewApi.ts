import type { GetOverviewStatsInput, OverviewStats } from "@shared/contracts/overview"

/**
 * 隔离概览数据对 Electron preload API 的直接依赖。
 */
export const overviewApi = {
  getStats: (input?: GetOverviewStatsInput): Promise<OverviewStats> =>
    window.api.overview.getStats(input),
}
