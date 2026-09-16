import type { ScheduleItem } from "@shared/contracts/schedule"
import { describe, expect, it } from "vitest"
import {
  countByPriority,
  fillRecentStats,
  filterScheduleItems,
  getCompletionRate,
  getNextPriority,
  getWeekDates,
  getWeekStartAndEnd,
  groupItemsByPriority,
  sortScheduleItems,
} from "@/features/schedule/utils"

// 构造测试条目（只覆盖参与计算的字段）。
const createItem = (patch: Partial<ScheduleItem>): ScheduleItem => ({
  id: 1,
  entryDate: "2026-09-16",
  content: "task",
  priority: "P1",
  completed: false,
  completedDate: null,
  sortOrder: 0,
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
  ...patch,
})

describe("schedule utils", () => {
  it("getNextPriority 在 P0-P3 间循环", () => {
    expect(getNextPriority("P0")).toBe("P1")
    expect(getNextPriority("P1")).toBe("P2")
    expect(getNextPriority("P2")).toBe("P3")
    expect(getNextPriority("P3")).toBe("P0")
  })

  it("sortScheduleItems 未完成优先，其次 P0..P3，再按原排序值", () => {
    const sorted = sortScheduleItems([
      createItem({ id: 1, priority: "P3", sortOrder: 0 }),
      createItem({ id: 2, priority: "P0", completed: true, sortOrder: 1 }),
      createItem({ id: 3, priority: "P0", sortOrder: 2 }),
      createItem({ id: 4, priority: "P1", sortOrder: -1 }),
      createItem({ id: 5, priority: "P0", sortOrder: 5 }),
    ])

    expect(sorted.map((item) => item.id)).toEqual([3, 5, 4, 1, 2])
  })

  it("countByPriority 统计各优先级数量", () => {
    const counts = countByPriority([
      createItem({ id: 1, priority: "P0" }),
      createItem({ id: 2, priority: "P0", completed: true }),
      createItem({ id: 3, priority: "P3" }),
    ])

    expect(counts).toEqual({ P0: 2, P1: 0, P2: 0, P3: 1 })
  })

  it("getCompletionRate 返回整数百分比，空列表为 0", () => {
    expect(getCompletionRate([])).toBe(0)
    expect(getCompletionRate([createItem({ id: 1 }), createItem({ id: 2, completed: true })])).toBe(
      50,
    )
    expect(
      getCompletionRate([
        createItem({ id: 1, completed: true }),
        createItem({ id: 2, completed: true }),
        createItem({ id: 3 }),
      ]),
    ).toBe(67)
  })

  it("fillRecentStats 补齐缺失日期并保留已有统计", () => {
    const filled = fillRecentStats(
      [{ date: "2026-09-16", plannedCount: 3, completedCount: 1 }],
      "2026-09-16",
      3,
    )

    expect(filled).toEqual([
      { date: "2026-09-14", plannedCount: 0, completedCount: 0 },
      { date: "2026-09-15", plannedCount: 0, completedCount: 0 },
      { date: "2026-09-16", plannedCount: 3, completedCount: 1 },
    ])
  })

  it("getWeekStartAndEnd 计算周一至周日区间", () => {
    // 2026-09-16 是周三，周一是 2026-09-14，周日是 2026-09-20
    const { startDate, endDate } = getWeekStartAndEnd("2026-09-16")
    expect(startDate).toBe("2026-09-14")
    expect(endDate).toBe("2026-09-20")
  })

  it("getWeekDates 正确生成 7 天感知带模型与状态匹配", () => {
    const weekDays = getWeekDates("2026-09-16", "2026-09-16", "zh-CN", {
      "2026-09-16": { plannedCount: 5, completedCount: 3 },
    })

    expect(weekDays).toHaveLength(7)
    expect(weekDays[0].dateKey).toBe("2026-09-14")
    expect(weekDays[6].dateKey).toBe("2026-09-20")

    const wednesday = weekDays[2]
    expect(wednesday.dateKey).toBe("2026-09-16")
    expect(wednesday.isToday).toBe(true)
    expect(wednesday.isSelected).toBe(true)
    expect(wednesday.entryCount).toBe(5)
    expect(wednesday.completedCount).toBe(3)
  })

  it("filterScheduleItems 按待办状态正确过滤", () => {
    const items = [
      createItem({ id: 1, completed: false }),
      createItem({ id: 2, completed: true }),
      createItem({ id: 3, completed: false }),
    ]

    expect(filterScheduleItems(items, "all")).toHaveLength(3)
    expect(filterScheduleItems(items, "pending")).toEqual([items[0], items[2]])
    expect(filterScheduleItems(items, "completed")).toEqual([items[1]])
  })

  it("groupItemsByPriority 按 P0-P3 四象限正确聚合", () => {
    const items = [
      createItem({ id: 1, priority: "P0" }),
      createItem({ id: 2, priority: "P1" }),
      createItem({ id: 3, priority: "P0" }),
      createItem({ id: 4, priority: "P3" }),
    ]

    const grouped = groupItemsByPriority(items)
    expect(grouped.P0.map((i) => i.id)).toEqual([1, 3])
    expect(grouped.P1.map((i) => i.id)).toEqual([2])
    expect(grouped.P2).toEqual([])
    expect(grouped.P3.map((i) => i.id)).toEqual([4])
  })
})
