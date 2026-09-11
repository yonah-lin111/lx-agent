import type { UsageTimeRange } from "@shared/contracts/usage"

export type {
  UsageDailyPoint,
  UsageFilterOptions,
  UsageLogPage,
  UsageLogRecord,
  UsageLogStatus,
  UsageModelStats,
  UsageProviderStats,
  UsagePurpose,
  UsageQuery,
  UsageRangeBounds,
  UsageSummary,
  UsageTimeRange,
  UsageTokens,
} from "@shared/contracts/usage"

// 用量页筛选状态。
export interface UsageFiltersState {
  range: UsageTimeRange
  provider?: string
  model?: string
  projectId?: string
}
