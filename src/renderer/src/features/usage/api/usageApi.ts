import type { UsageQuery } from "@shared/contracts/usage"
import type {
  UsageDailyPoint,
  UsageFilterOptions,
  UsageGranularity,
  UsageLogPage,
  UsageModelStats,
  UsageProviderStats,
  UsageSummary,
} from "../types"

/**
 * 隔离用量统计对 Electron preload API 的直接依赖。
 */
export const usageApi = {
  listLogs: (query: UsageQuery, page?: number, pageSize?: number): Promise<UsageLogPage> =>
    window.api.usage.listLogs(query, page, pageSize),
  getSummary: (query: UsageQuery): Promise<UsageSummary> => window.api.usage.getSummary(query),
  getDaily: (query: UsageQuery, granularity?: UsageGranularity): Promise<UsageDailyPoint[]> =>
    window.api.usage.getDaily(query, granularity),
  getModelStats: (query: UsageQuery): Promise<UsageModelStats[]> =>
    window.api.usage.getModelStats(query),
  getProviderStats: (query: UsageQuery): Promise<UsageProviderStats[]> =>
    window.api.usage.getProviderStats(query),
  getFilterOptions: (query: UsageQuery): Promise<UsageFilterOptions> =>
    window.api.usage.getFilterOptions(query),
  onLogRecorded: (handler: () => void): (() => void) => window.api.usage.onLogRecorded(handler),
}
