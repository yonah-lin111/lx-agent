import { describe, expect, it } from "vitest"
import { buildHeatmapMonths, getActivityLevel } from "@/features/app-index/utils"

describe("app-index heatmapUtils", () => {
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

  it("空列表安全返回空网格", () => {
    const result = buildHeatmapMonths([])
    expect(result.months).toEqual([])
    expect(result.maxCount).toBe(0)
  })

  it("buildHeatmapMonths 正确将记录按月聚合为自适应独立月份块", () => {
    // 构造跨 2 个月的记录：8月最后2天 + 9月前3天
    const entries = [
      { date: "2026-08-30", count: 10 }, // 2026-08-30 是周日
      { date: "2026-08-31", count: 20 }, // 2026-08-31 是周一
      { date: "2026-09-01", count: 30 }, // 2026-09-01 是周二
      { date: "2026-09-02", count: 50 },
    ]

    const result = buildHeatmapMonths(entries)
    expect(result.maxCount).toBe(50)
    expect(result.months).toHaveLength(2)

    // 8 月块
    const aug = result.months[0]
    expect(aug.monthKey).toBe("2026-08")
    expect(aug.label).toBe("Aug")
    expect(aug.weeks.length).toBeGreaterThanOrEqual(1)

    // 9 月块
    const sep = result.months[1]
    expect(sep.monthKey).toBe("2026-09")
    expect(sep.label).toBe("Sep")
    expect(sep.weeks.length).toBeGreaterThanOrEqual(1)

    // 9 月 1 日是周二，则首周的周一（索引 0）应为 null 占位符
    const sepFirstWeek = sep.weeks[0]
    expect(sepFirstWeek.days[0]).toBeNull()
    expect(sepFirstWeek.days[1]).toMatchObject({
      date: "2026-09-01",
      count: 30,
    })
  })

  it("按每日会话数分阶：零会话为 level 0，最大会话为 level 4", () => {
    const result = buildHeatmapMonths([
      { date: "2026-09-14", count: 0 },
      { date: "2026-09-15", count: 2 },
      { date: "2026-09-16", count: 8 },
    ])

    const days = result.months[0].weeks.flatMap((week) => week.days)
    const byDate = new Map(days.filter((day) => day !== null).map((day) => [day.date, day]))
    expect(byDate.get("2026-09-14")?.level).toBe(0)
    expect(byDate.get("2026-09-15")?.level).toBe(1)
    expect(byDate.get("2026-09-16")?.level).toBe(4)
  })
})
