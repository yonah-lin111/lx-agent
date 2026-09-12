import type { UsageDailyPoint } from "./types"

// 美元金额格式化：未配置价格（null）显示 --。
export const formatUsd = (value: number | null | undefined, fractionDigits = 4): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--"
  if (value === 0) return "$0"
  // 极小金额保留更多小数位，避免显示为 0。
  const digits = value < 0.0001 ? 6 : fractionDigits
  return `$${value.toFixed(digits)}`
}

// 数字千分位格式化。
export const formatNumber = (value: number): string => value.toLocaleString("en-US")

// 紧凑数字格式化（k / M / B）。
export const formatCompact = (value: number): string => {
  const absolute = Math.abs(value)
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

// 百分比格式化。
export const formatPercent = (value: number, fractionDigits = 1): string => {
  if (!Number.isFinite(value)) return "--"
  return `${value.toFixed(fractionDigits)}%`
}

// 缓存命中率（%）：input 为总输入（已包含缓存读写），无输入时为 null。
export const calcCacheHitRate = (inputTokens: number, cacheReadTokens: number): number | null => {
  if (!Number.isFinite(inputTokens) || inputTokens <= 0) return null
  const rate = (cacheReadTokens / inputTokens) * 100
  return Math.min(100, Math.max(0, rate))
}

// 耗时格式化（ms / s / m）。
export const formatDuration = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) return "--"
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

// 时间戳转本地日期键（YYYY-MM-DD）。
export const toLocalDateKey = (timestamp: number): string => {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// 时间戳转本地时间文本（MM-DD HH:mm）。
export const formatDateTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${month}-${day} ${hours}:${minutes}`
}

// 图表用新鲜输入 = 输入总量扣除缓存读写（非负钳制）。
export const getFreshInputTokens = (point: {
  inputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}): number => Math.max(0, point.inputTokens - point.cacheReadTokens - point.cacheWriteTokens)

/**
 * 按时间范围补齐每日数据点（缺失日期补零，保证图表 X 轴连续）。
 * startTime 缺省时以首个数据点为起点；无数据时返回空数组。
 */
export const fillDailySeries = (
  points: UsageDailyPoint[],
  startTime?: number,
  endTime?: number,
): UsageDailyPoint[] => {
  const pointMap = new Map(points.map((point) => [point.date, point]))
  const fallbackStart = points.length > 0 ? new Date(`${points[0].date}T00:00:00`).getTime() : null
  const rangeStart = startTime ?? fallbackStart
  if (rangeStart === null) return []

  const end = endTime ?? Date.now()
  const cursor = new Date(rangeStart)
  cursor.setHours(0, 0, 0, 0)
  const endDate = new Date(end)
  endDate.setHours(0, 0, 0, 0)

  const result: UsageDailyPoint[] = []
  // 上限 366 天，防止异常时间边界导致超长循环。
  for (let index = 0; index < 366 && cursor.getTime() <= endDate.getTime(); index += 1) {
    const key = toLocalDateKey(cursor.getTime())
    result.push(
      pointMap.get(key) ?? {
        date: key,
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalCostUsd: null,
      },
    )
    cursor.setDate(cursor.getDate() + 1)
  }

  return result
}
