// Token 使用统计契约：请求日志、成本计算、聚合查询与 preload API 类型。

// 模型调用的 token 用量（input 为 AI SDK 总量，已包含 cacheRead 与 cacheWrite）。
export interface UsageTokens {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

// 模型调用的来源类型。
export type UsagePurpose = "chat" | "subagent" | "compaction" | "title" | "suggested"

// 请求日志状态。
export type UsageLogStatus = "success" | "error" | "aborted"

// 统计时间范围预设。
export type UsageTimeRange = "today" | "7d" | "30d" | "all"

// 每百万 token 的美元单价（模型配置中手动维护）。
export interface ModelPricing {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

// 单次请求的四段成本与总成本；未配置单价时全部为 null。
export interface UsageRates {
  inputCostUsd: number | null
  outputCostUsd: number | null
  cacheReadCostUsd: number | null
  cacheWriteCostUsd: number | null
  totalCostUsd: number | null
}

// 写入一条请求日志的输入。
export interface UsageLogInput {
  sessionId?: string | null
  projectId?: string | null
  purpose: UsagePurpose
  provider: string
  model: string
  tokens: UsageTokens
  durationMs?: number | null
  status: UsageLogStatus
  errorMessage?: string | null
  createdAt?: number
}

// 请求日志行。
export interface UsageLogRecord {
  id: number
  externalId: string
  sessionId: string | null
  projectId: string | null
  purpose: UsagePurpose
  provider: string
  model: string
  tokens: UsageTokens
  rates: UsageRates
  durationMs: number | null
  status: UsageLogStatus
  errorMessage: string | null
  createdAt: number
}

// 统计查询条件：毫秒时间戳边界与维度筛选。
export interface UsageQuery {
  startTime?: number
  endTime?: number
  provider?: string
  model?: string
  projectId?: string
}

// 汇总统计。
export interface UsageSummary {
  requestCount: number
  successCount: number
  errorCount: number
  abortedCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  // input 已包含缓存读写，totalTokens = input + output。
  totalTokens: number
  // 配置了价格的请求数；为 0 时总成本为 null。
  pricedRequestCount: number
  totalCostUsd: number | null
  successRate: number
  avgDurationMs: number | null
}

// 按日聚合点（date 为本地日期 YYYY-MM-DD）。
export interface UsageDailyPoint {
  date: string
  requestCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalCostUsd: number | null
}

// 按模型聚合统计。
export interface UsageModelStats {
  model: string
  requestCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  totalCostUsd: number | null
  avgCostPerRequestUsd: number | null
}

// 按 Provider 聚合统计。
export interface UsageProviderStats {
  provider: string
  requestCount: number
  totalTokens: number
  totalCostUsd: number | null
  successRate: number
  avgDurationMs: number | null
}

// 请求日志分页结果。
export interface UsageLogPage {
  rows: UsageLogRecord[]
  total: number
  page: number
  pageSize: number
}

// 统计筛选可选值。
export interface UsageFilterOptions {
  providers: string[]
  models: string[]
  projects: { id: string; name: string }[]
}

// 时间范围预设解析结果（all 无边界）。
export interface UsageRangeBounds {
  startTime?: number
  endTime?: number
}

const PRICE_UNIT = 1_000_000

/**
 * 计算单次请求成本：新鲜输入、输出、缓存读、缓存写四段单价求和。
 * 未配置 pricing 时全部返回 null（日志仍保留并参与 token 统计）。
 */
export const computeUsageRates = (
  tokens: UsageTokens,
  pricing?: ModelPricing | null,
): UsageRates => {
  if (!pricing) {
    return {
      inputCostUsd: null,
      outputCostUsd: null,
      cacheReadCostUsd: null,
      cacheWriteCostUsd: null,
      totalCostUsd: null,
    }
  }

  // input 是含缓存的 AI SDK 总量，新鲜输入需扣除缓存读写并做非负钳制。
  const freshInput = Math.max(0, tokens.input - tokens.cacheRead - tokens.cacheWrite)
  const inputCostUsd = (freshInput * pricing.input) / PRICE_UNIT
  const outputCostUsd = (tokens.output * pricing.output) / PRICE_UNIT
  const cacheReadCostUsd = (tokens.cacheRead * pricing.cacheRead) / PRICE_UNIT
  const cacheWriteCostUsd = (tokens.cacheWrite * pricing.cacheWrite) / PRICE_UNIT

  return {
    inputCostUsd,
    outputCostUsd,
    cacheReadCostUsd,
    cacheWriteCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd + cacheReadCostUsd + cacheWriteCostUsd,
  }
}

/**
 * 解析时间范围预设为本地日边界毫秒时间戳。
 */
export const resolveUsageRange = (
  range: UsageTimeRange,
  now: number = Date.now(),
): UsageRangeBounds => {
  if (range === "all") return {}

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30
  const start = new Date(startOfToday)
  start.setDate(start.getDate() - (days - 1))

  return { startTime: start.getTime(), endTime: now }
}

// Token 使用统计 preload API 契约。
export interface UsageApi {
  usage: {
    listLogs: (query: UsageQuery, page?: number, pageSize?: number) => Promise<UsageLogPage>
    getSummary: (query: UsageQuery) => Promise<UsageSummary>
    getDaily: (query: UsageQuery) => Promise<UsageDailyPoint[]>
    getModelStats: (query: UsageQuery) => Promise<UsageModelStats[]>
    getProviderStats: (query: UsageQuery) => Promise<UsageProviderStats[]>
    getFilterOptions: (query: UsageQuery) => Promise<UsageFilterOptions>
    // 订阅日志写入事件，返回退订函数。
    onLogRecorded: (handler: () => void) => () => void
  }
}
