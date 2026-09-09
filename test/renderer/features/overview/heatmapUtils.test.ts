import { describe, expect, it } from "vitest"
import { buildHeatmapWeeks, formatNumber, getActivityLevel } from "@/features/overview/utils"

describe("overview heatmapUtils", () => {
  it("根据最大频次按比例正确映射活动阶梯等级", () => {
    // maxCount = 100
    expect(getActivityLevel(0, 100)).toBe(0)
    expect(getActivityLevel(10, 100)).toBe(1) // 10% -> 1
    expect(getActivityLevel(25, 100)).toBe(1) // 25% -> 1
    expect(getActivityLevel(40, 100)).toBe(2) // 40% -> 2
    expect(getActivityLevel(50, 100)).toBe(2) // 50% -> 2
    expect(getActivityLevel(70, 100)).toBe(3) // 70% -> 3
    expect(getActivityLevel(75, 100)).toBe(3) // 75% -> 3
    expect(getActivityLevel(80, 100)).toBe(4) // 80% -> 4
    expect(getActivityLevel(100, 100)).toBe(4) // 100% -> 4

    // maxCount = 200
    expect(getActivityLevel(100, 200)).toBe(2)
    expect(getActivityLevel(160, 200)).toBe(4)
  })

  it("正确格式化数字千分位", () => {
    expect(formatNumber(1234)).toBe("1,234")
    expect(formatNumber(0)).toBe("0")
  })

  it("空列表安全返回空网格", () => {
    const result = buildHeatmapWeeks([])
    expect(result.weeks).toEqual([])
    expect(result.monthLabels).toEqual([])
    expect(result.maxCount).toBe(0)
  })

  it("正确将平铺记录组织为 7 天每周的网格列并提取 maxCount", () => {
    const entries = [
      { date: "2026-09-07", count: 20, turns: 10, toolCalls: 10 }, // 2026-09-07 是周一
      { date: "2026-09-08", count: 0, turns: 0, toolCalls: 0 },
      { date: "2026-09-09", count: 100, turns: 60, toolCalls: 40 },
    ]

    const result = buildHeatmapWeeks(entries)

    expect(result.maxCount).toBe(100)
    expect(result.weeks.length).toBeGreaterThan(0)
    const firstWeek = result.weeks[0]
    expect(firstWeek.days).toHaveLength(7)
    // 20/100 = 0.20 <= 0.25 -> level 1
    expect(firstWeek.days[0]).toMatchObject({
      date: "2026-09-07",
      count: 20,
      level: 1,
    })
    // 0 -> level 0
    expect(firstWeek.days[1]).toMatchObject({
      date: "2026-09-08",
      count: 0,
      level: 0,
    })
    // 100/100 = 1.0 -> level 4
    expect(firstWeek.days[2]).toMatchObject({
      date: "2026-09-09",
      count: 100,
      level: 4,
    })
    // 剩余天数补齐 null
    expect(firstWeek.days[3]).toBeNull()

    // 验证 tiers
    expect(result.tiers).toHaveLength(1)
    expect(result.tiers[0][0].monthLabel).toBe("Sep")
  })

  it("当包含多周跨度记录时正确划分为对称双层（tiers）并标注月份", () => {
    // 构造跨度 14 天（2 周）的记录
    const entries = Array.from({ length: 14 }, (_, i) => {
      const day = String(i + 1).padStart(2, "0")
      return {
        date: `2026-09-${day}`,
        count: i * 5,
        turns: i,
        toolCalls: i,
      }
    })

    const result = buildHeatmapWeeks(entries)
    expect(result.weeks.length).toBeGreaterThanOrEqual(2)
    expect(result.tiers).toHaveLength(2)
    // 两个层级列数保持对称
    expect(result.tiers[0].length).toBe(result.tiers[1].length)
    expect(result.tiers[0][0].monthLabel).toBe("Sep")
    expect(result.tiers[1][0].monthLabel).toBe("Sep")
  })
})
