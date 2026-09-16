import type { ScheduleItem } from "@shared/contracts/schedule"
import { describe, expect, it } from "vitest"
import {
  countByPriority,
  fillRecentStats,
  getCompletionRate,
  getNextPriority,
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
})
