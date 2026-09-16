import { describe, expect, it } from "vitest"
import {
  formatDayOfMonth,
  getMonthGrid,
  getMonthKey,
  getMonthRange,
  getRecentRange,
  getTodayKey,
  getWeekdayLabels,
  getWeekStartKey,
  isValidDateKey,
  shiftDateKey,
  shiftMonthKey,
  toDateKey,
} from "@/lib/date"

describe("date utils", () => {
  it("toDateKey / getTodayKey 使用本地时区字段", () => {
    expect(toDateKey(new Date(2026, 8, 16, 23, 30))).toBe("2026-09-16")
    expect(toDateKey(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01")
    expect(getTodayKey()).toBe(toDateKey(new Date()))
  })

  it("isValidDateKey 拒绝格式错误与溢出日期", () => {
    expect(isValidDateKey("2026-09-16")).toBe(true)
    expect(isValidDateKey("2026-2-3")).toBe(false)
    expect(isValidDateKey("2026-02-30")).toBe(false)
    expect(isValidDateKey("2026-13-01")).toBe(false)
  })

  it("shiftDateKey 跨月与跨年偏移", () => {
    expect(shiftDateKey("2026-09-16", 1)).toBe("2026-09-17")
    expect(shiftDateKey("2026-09-01", -1)).toBe("2026-08-31")
    expect(shiftDateKey("2026-12-31", 1)).toBe("2027-01-01")
  })

  it("月份键偏移跨年安全并返回首尾日期", () => {
    expect(getMonthKey("2026-09-16")).toBe("2026-09")
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01")
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12")
    expect(getMonthRange("2026-02")).toEqual({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    })
    expect(getMonthRange("2028-02").endDate).toBe("2028-02-29")
  })

  it("getRecentRange 以终点向前取 N 天（含终点）", () => {
    expect(getRecentRange("2026-09-16", 7)).toEqual({
      startDate: "2026-09-10",
      endDate: "2026-09-16",
    })
    expect(getRecentRange("2026-09-16", 1)).toEqual({
      startDate: "2026-09-16",
      endDate: "2026-09-16",
    })
  })

  it("getWeekStartKey 以周一为一周起点", () => {
    // 2026-09-16 是周三。
    expect(getWeekStartKey("2026-09-16")).toBe("2026-09-14")
    // 2026-09-20 是周日，归入 09-14 起的那一周。
    expect(getWeekStartKey("2026-09-20")).toBe("2026-09-14")
    // 2026-09-21 是周一。
    expect(getWeekStartKey("2026-09-21")).toBe("2026-09-21")
  })

  it("getMonthGrid 生成 42 格周一起始网格并标记补位", () => {
    const grid = getMonthGrid("2026-09")

    expect(grid).toHaveLength(42)
    // 2026-09-01 是周二，网格首格是 2026-08-31。
    expect(grid[0]).toEqual({ dateKey: "2026-08-31", dayOfMonth: 31, isCurrentMonth: false })
    expect(grid[1]).toEqual({ dateKey: "2026-09-01", dayOfMonth: 1, isCurrentMonth: true })
    expect(grid.filter((day) => day.isCurrentMonth)).toHaveLength(30)
    expect(grid[41].dateKey).toBe("2026-10-11")
  })

  it("getWeekdayLabels 输出周一起始的 7 个标签", () => {
    expect(getWeekdayLabels("en-US")).toHaveLength(7)
    expect(getWeekdayLabels("en-US")[0].toLowerCase()).toContain("mon")
  })

  it("formatDayOfMonth 输出 M/D", () => {
    expect(formatDayOfMonth("2026-09-06")).toBe("9/6")
    expect(formatDayOfMonth("2026-12-31")).toBe("12/31")
  })
})
