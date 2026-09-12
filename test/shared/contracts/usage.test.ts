import {
  computeUsageRates,
  resolveUsageGranularity,
  resolveUsageRange,
  type UsageTokens,
} from "@shared/contracts/usage"
import { describe, expect, it } from "vitest"

const tokens: UsageTokens = { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100 }

describe("computeUsageRates", () => {
  it("未配置价格时全部成本为 null", () => {
    expect(computeUsageRates(tokens)).toEqual({
      inputCostUsd: null,
      outputCostUsd: null,
      cacheReadCostUsd: null,
      cacheWriteCostUsd: null,
      totalCostUsd: null,
    })
    expect(computeUsageRates(tokens, null).totalCostUsd).toBeNull()
  })

  it("按新鲜输入 / 输出 / 缓存读写四段单价求和（input 为含缓存总量）", () => {
    const rates = computeUsageRates(tokens, {
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite: 3.75,
    })

    // 新鲜输入 = 1000 - 200 - 100 = 700
    expect(rates.inputCostUsd).toBeCloseTo(700 * 3e-6, 10)
    expect(rates.outputCostUsd).toBeCloseTo(500 * 15e-6, 10)
    expect(rates.cacheReadCostUsd).toBeCloseTo(200 * 0.3e-6, 10)
    expect(rates.cacheWriteCostUsd).toBeCloseTo(100 * 3.75e-6, 10)
    expect(rates.totalCostUsd).toBeCloseTo(
      rates.inputCostUsd! +
        rates.outputCostUsd! +
        rates.cacheReadCostUsd! +
        rates.cacheWriteCostUsd!,
      10,
    )
  })

  it("缓存 token 超过 input 总量时新鲜输入按 0 钳制", () => {
    const rates = computeUsageRates(
      { input: 100, output: 0, cacheRead: 80, cacheWrite: 40 },
      { input: 10, output: 10, cacheRead: 1, cacheWrite: 1 },
    )

    expect(rates.inputCostUsd).toBe(0)
    expect(rates.cacheReadCostUsd).toBeCloseTo(80 * 1e-6, 10)
    expect(rates.cacheWriteCostUsd).toBeCloseTo(40 * 1e-6, 10)
  })
})

describe("resolveUsageRange", () => {
  it("all 不返回时间边界", () => {
    expect(resolveUsageRange("all", Date.now())).toEqual({})
  })

  it("today / 7d / 30d 从本地日开始计算", () => {
    const now = new Date(2026, 8, 11, 15, 30, 0)
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    const today = resolveUsageRange("today", now.getTime())
    expect(today.startTime).toBe(startOfToday.getTime())
    expect(today.endTime).toBe(now.getTime())

    const sevenDays = new Date(startOfToday)
    sevenDays.setDate(sevenDays.getDate() - 6)
    expect(resolveUsageRange("7d", now.getTime()).startTime).toBe(sevenDays.getTime())

    const thirtyDays = new Date(startOfToday)
    thirtyDays.setDate(thirtyDays.getDate() - 29)
    expect(resolveUsageRange("30d", now.getTime()).startTime).toBe(thirtyDays.getTime())
  })

  it("today 按小时聚合，其余范围按天聚合", () => {
    expect(resolveUsageGranularity("today")).toBe("hour")
    expect(resolveUsageGranularity("7d")).toBe("day")
    expect(resolveUsageGranularity("30d")).toBe("day")
    expect(resolveUsageGranularity("all")).toBe("day")
  })
})
