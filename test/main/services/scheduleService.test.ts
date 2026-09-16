import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runMigrations } from "@/db"
import { createScheduleService } from "@/services/scheduleService"

let database: Database.Database
let service: ReturnType<typeof createScheduleService>

// 本地日期键（与 service 的完成日期口径一致）。
const toLocalDateKey = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

beforeEach(() => {
  database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  runMigrations(database)
  service = createScheduleService(() => database)
})

afterEach(() => {
  database.close()
})

describe("scheduleService", () => {
  it("新建条目默认 P1、置顶当日列表且未完成", () => {
    const first = service.create({ entryDate: "2026-09-16", content: "写方案" })
    const second = service.create({
      entryDate: "2026-09-16",
      content: "评审代码",
      priority: "P0",
    })

    expect(first.priority).toBe("P1")
    expect(first.completed).toBe(false)
    expect(first.completedDate).toBeNull()
    expect(second.priority).toBe("P0")
    expect(second.sortOrder).toBeLessThan(first.sortOrder)

    expect(service.listByDate({ entryDate: "2026-09-16" }).map((item) => item.content)).toEqual([
      "评审代码",
      "写方案",
    ])
  })

  it("按日期隔离列表，空日期返回空数组", () => {
    service.create({ entryDate: "2026-09-16", content: "A" })

    expect(service.listByDate({ entryDate: "2026-09-16" })).toHaveLength(1)
    expect(service.listByDate({ entryDate: "2026-09-15" })).toEqual([])
  })

  it("完成状态切换记录 / 清空完成日期", () => {
    const created = service.create({ entryDate: "2026-09-16", content: "A" })

    const completed = service.update({ id: created.id, completed: true })
    expect(completed.completed).toBe(true)
    expect(completed.completedDate).toBe(toLocalDateKey(new Date()))

    const restored = service.update({ id: created.id, completed: false })
    expect(restored.completed).toBe(false)
    expect(restored.completedDate).toBeNull()
  })

  it("更新正文与优先级并校验输入", () => {
    const created = service.create({ entryDate: "2026-09-16", content: "A" })

    const updated = service.update({ id: created.id, content: "  改过的标题  ", priority: "P2" })
    expect(updated.content).toBe("改过的标题")
    expect(updated.priority).toBe("P2")

    expect(() => service.update({ id: created.id, content: "   " })).toThrow(
      "INVALID_SCHEDULE_INPUT",
    )
    expect(() => service.update({ id: created.id, priority: "P9" as unknown as "P1" })).toThrow(
      "INVALID_SCHEDULE_INPUT",
    )
  })

  it("跨日移动并入目标日期顶部并保持两端列表正确", () => {
    const target = service.create({ entryDate: "2026-09-17", content: "目标日已有" })
    const moving = service.create({ entryDate: "2026-09-16", content: "被移动" })

    const moved = service.update({ id: moving.id, entryDate: "2026-09-17" })

    expect(moved.entryDate).toBe("2026-09-17")
    expect(moved.sortOrder).toBeLessThan(target.sortOrder)
    expect(service.listByDate({ entryDate: "2026-09-16" })).toEqual([])
    expect(service.listByDate({ entryDate: "2026-09-17" }).map((item) => item.content)).toEqual([
      "被移动",
      "目标日已有",
    ])
  })

  it("删除条目，重复删除抛 NOT_FOUND", () => {
    const created = service.create({ entryDate: "2026-09-16", content: "A" })

    service.remove(created.id)
    expect(service.listByDate({ entryDate: "2026-09-16" })).toEqual([])
    expect(() => service.remove(created.id)).toThrow("SCHEDULE_ITEM_NOT_FOUND")
  })

  it("按传入顺序重排；非法 id 触发事务回滚", () => {
    const first = service.create({ entryDate: "2026-09-16", content: "A" })
    const second = service.create({ entryDate: "2026-09-16", content: "B" })

    service.reorder({ entryDate: "2026-09-16", ids: [first.id, second.id] })
    expect(service.listByDate({ entryDate: "2026-09-16" }).map((item) => item.content)).toEqual([
      "A",
      "B",
    ])

    expect(() =>
      service.reorder({ entryDate: "2026-09-16", ids: [second.id, first.id, 9999] }),
    ).toThrow("INVALID_SCHEDULE_REORDER")
    expect(service.listByDate({ entryDate: "2026-09-16" }).map((item) => item.content)).toEqual([
      "A",
      "B",
    ])
  })

  it("重排拒绝跨日期的 id", () => {
    const currentDay = service.create({ entryDate: "2026-09-16", content: "A" })
    const otherDay = service.create({ entryDate: "2026-09-17", content: "B" })

    expect(() =>
      service.reorder({ entryDate: "2026-09-16", ids: [currentDay.id, otherDay.id] }),
    ).toThrow("INVALID_SCHEDULE_REORDER")
  })

  it("区间统计按日合并计划数与完成数，仅返回有数据的日期", () => {
    const today = toLocalDateKey(new Date())
    const yesterday = toLocalDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000))

    service.create({ entryDate: today, content: "A" })
    const doneToday = service.create({ entryDate: today, content: "B" })
    service.update({ id: doneToday.id, completed: true })
    service.create({ entryDate: yesterday, content: "C" })

    const stats = service.listRangeStats({ startDate: yesterday, endDate: today })

    expect(stats.map((entry) => entry.date)).toEqual([yesterday, today])
    expect(stats[0]).toEqual({ date: yesterday, plannedCount: 1, completedCount: 0 })
    expect(stats[1]).toEqual({ date: today, plannedCount: 2, completedCount: 1 })
  })

  it("拒绝非法日期与越界区间", () => {
    expect(() => service.listByDate({ entryDate: "2026-2-3" })).toThrow("INVALID_SCHEDULE_INPUT")
    expect(() => service.create({ entryDate: "2026-02-30", content: "x" })).toThrow(
      "INVALID_SCHEDULE_INPUT",
    )
    expect(() =>
      service.listRangeStats({ startDate: "2026-09-17", endDate: "2026-09-16" }),
    ).toThrow("INVALID_SCHEDULE_INPUT")
  })
})
