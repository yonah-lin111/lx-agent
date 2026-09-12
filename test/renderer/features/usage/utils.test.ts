import { describe, expect, it } from "vitest"
import type { UsageDailyPoint } from "@/features/usage/types"
import {
  calcCacheHitRate,
  fillUsageSeries,
  formatBucketLabel,
  formatCompact,
  formatDuration,
  formatNumber,
  formatPercent,
  formatUsd,
  getFreshInputTokens,
  toLocalDateKey,
  toLocalHourKey,
} from "@/features/usage/utils"

const createPoint = (date: string, overrides: Partial<UsageDailyPoint> = {}): UsageDailyPoint => ({
  date,
  requestCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalCostUsd: null,
  ...overrides,
})

describe("usage utils formatters", () => {
  it("formatUsd 未配置价格显示 --，零与小金额正确格式化", () => {
    expect(formatUsd(null)).toBe("--")
    expect(formatUsd(undefined)).toBe("--")
    expect(formatUsd(0)).toBe("$0")
    expect(formatUsd(0.123456)).toBe("$0.1235")
    expect(formatUsd(0.000012)).toBe("$0.000012")
  })

  it("formatNumber / formatCompact / formatPercent / formatDuration", () => {
    expect(formatNumber(1234567)).toBe("1,234,567")
    expect(formatCompact(999)).toBe("999")
    expect(formatCompact(1500)).toBe("1.5k")
    expect(formatCompact(2_400_000)).toBe("2.4M")
    expect(formatPercent(66.666)).toBe("66.7%")
    expect(formatDuration(null)).toBe("--")
    expect(formatDuration(250)).toBe("250ms")
    expect(formatDuration(1500)).toBe("1.5s")
    expect(formatDuration(65_000)).toBe("1m 5s")
  })

  it("calcCacheHitRate 按总输入计算命中率并处理边界", () => {
    expect(calcCacheHitRate(1000, 100)).toBeCloseTo(10)
    expect(calcCacheHitRate(1000, 0)).toBe(0)
    expect(calcCacheHitRate(0, 100)).toBeNull()
    expect(calcCacheHitRate(Number.NaN, 100)).toBeNull()
    expect(calcCacheHitRate(100, 300)).toBe(100)
  })
})

describe("usage utils series", () => {
  it("toLocalDateKey 生成本地日期键", () => {
    expect(toLocalDateKey(new Date(2026, 8, 11, 23, 30).getTime())).toBe("2026-09-11")
  })

  it("getFreshInputTokens 扣除缓存并做非负钳制", () => {
    expect(
      getFreshInputTokens({ inputTokens: 100, cacheReadTokens: 30, cacheWriteTokens: 20 }),
    ).toBe(50)
    expect(
      getFreshInputTokens({ inputTokens: 10, cacheReadTokens: 30, cacheWriteTokens: 20 }),
    ).toBe(0)
  })

  it("fillUsageSeries 按范围补齐缺失日期", () => {
    const start = new Date(2026, 8, 10).getTime()
    const end = new Date(2026, 8, 12, 12, 0).getTime()
    const filled = fillUsageSeries(
      [createPoint("2026-09-11", { requestCount: 2, inputTokens: 100 })],
      "day",
      start,
      end,
    )

    expect(filled.map((point) => point.date)).toEqual(["2026-09-10", "2026-09-11", "2026-09-12"])
    expect(filled[0].requestCount).toBe(0)
    expect(filled[1].inputTokens).toBe(100)
    expect(filled[2].totalCostUsd).toBeNull()
  })

  it("fillUsageSeries hour 粒度补齐当天整点且最多 24 个桶", () => {
    const start = new Date(2026, 8, 11, 0, 0, 0).getTime()
    const end = new Date(2026, 8, 11, 2, 30, 0).getTime()
    const filled = fillUsageSeries(
      [createPoint("2026-09-11 01:00", { requestCount: 5, inputTokens: 50 })],
      "hour",
      start,
      end,
    )

    expect(filled.map((point) => point.date)).toEqual([
      "2026-09-11 00:00",
      "2026-09-11 01:00",
      "2026-09-11 02:00",
    ])
    expect(filled[0].requestCount).toBe(0)
    expect(filled[1].inputTokens).toBe(50)
    expect(filled[2].requestCount).toBe(0)

    const fullDay = fillUsageSeries([], "hour", start, new Date(2026, 8, 11, 23, 59).getTime())
    expect(fullDay).toHaveLength(24)
    expect(fullDay.at(-1)?.date).toBe("2026-09-11 23:00")
  })

  it("fillUsageSeries 无数据且无起点时返回空数组", () => {
    expect(fillUsageSeries([], "day", undefined, Date.now())).toEqual([])
    expect(fillUsageSeries([], "hour", undefined, Date.now())).toEqual([])
  })

  it("toLocalHourKey / formatBucketLabel 处理小时与日期标签", () => {
    const timestamp = new Date(2026, 8, 11, 9, 45, 0).getTime()
    expect(toLocalHourKey(timestamp)).toBe("2026-09-11 09:00")
    expect(formatBucketLabel("2026-09-11 09:00", "hour")).toBe("09:00")
    expect(formatBucketLabel("2026-09-11", "day")).toBe("09-11")
  })
})
