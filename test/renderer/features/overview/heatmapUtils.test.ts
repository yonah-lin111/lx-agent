import { describe, expect, it } from "vitest"
import { buildHeatmapWeeks, formatNumber, getActivityLevel } from "@/features/overview/utils"

describe("overview heatmapUtils", () => {
  it("正确映射活动阶梯等级", () => {
    expect(getActivityLevel(0)).toBe(0)
    expect(getActivityLevel(1)).toBe(1)
    expect(getActivityLevel(2)).toBe(1)
    expect(getActivityLevel(3)).toBe(2)
    expect(getActivityLevel(5)).toBe(2)
    expect(getActivityLevel(6)).toBe(3)
    expect(getActivityLevel(9)).toBe(3)
    expect(getActivityLevel(10)).toBe(4)
    expect(getActivityLevel(100)).toBe(4)
  })

  it("正确格式化数字千分位", () => {
    expect(formatNumber(1234)).toBe("1,234")
    expect(formatNumber(0)).toBe("0")
  })

  it("空列表安全返回空网格", () => {
    const result = buildHeatmapWeeks([])
    expect(result.weeks).toEqual([])
    expect(result.monthLabels).toEqual([])
  })

  it("正确将平铺记录组织为 7 天每周的网格列", () => {
    const entries = [
      { date: "2026-09-07", count: 5, turns: 3, toolCalls: 2 }, // 2026-09-07 是周一
      { date: "2026-09-08", count: 0, turns: 0, toolCalls: 0 },
      { date: "2026-09-09", count: 12, turns: 8, toolCalls: 4 },
    ]

    const result = buildHeatmapWeeks(entries)

    expect(result.weeks.length).toBeGreaterThan(0)
    const firstWeek = result.weeks[0]
    expect(firstWeek.days).toHaveLength(7)
    // 第一天是周一，应位于索引 0
    expect(firstWeek.days[0]).toMatchObject({
      date: "2026-09-07",
      count: 5,
      level: 2,
    })
    expect(firstWeek.days[1]).toMatchObject({
      date: "2026-09-08",
      count: 0,
      level: 0,
    })
    expect(firstWeek.days[2]).toMatchObject({
      date: "2026-09-09",
      count: 12,
      level: 4,
    })
    // 剩余天数补齐 null
    expect(firstWeek.days[3]).toBeNull()
  })
})
