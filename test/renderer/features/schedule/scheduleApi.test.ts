// @vitest-environment jsdom

import type { ScheduleItem } from "@shared/contracts/schedule"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SCHEDULE_CHANGED_EVENT, scheduleApi } from "@/features/schedule/api/scheduleApi"

const item: ScheduleItem = {
  id: 1,
  entryDate: "2026-09-19",
  content: "写方案",
  priority: "P1",
  completed: false,
  completedDate: null,
  sortOrder: 0,
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
}

const createApiMock = () => ({
  listByDate: vi.fn().mockResolvedValue([item]),
  create: vi.fn().mockResolvedValue(item),
  update: vi.fn().mockResolvedValue(item),
  remove: vi.fn().mockResolvedValue(undefined),
  reorder: vi.fn().mockResolvedValue(undefined),
  listRangeStats: vi.fn().mockResolvedValue([]),
})

describe("scheduleApi 变更广播", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("写操作成功后广播一次 schedule:changed", async () => {
    // @ts-expect-error Mock window.api
    window.api = { schedule: createApiMock() }
    const listener = vi.fn()
    window.addEventListener(SCHEDULE_CHANGED_EVENT, listener)

    await scheduleApi.create({ entryDate: "2026-09-19", content: "写方案" })
    await Promise.resolve()

    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(SCHEDULE_CHANGED_EVENT, listener)
  })

  it("同一批次的多次写操作合并为一次广播", async () => {
    // @ts-expect-error Mock window.api
    window.api = { schedule: createApiMock() }
    const listener = vi.fn()
    window.addEventListener(SCHEDULE_CHANGED_EVENT, listener)

    await Promise.all([
      scheduleApi.update({ id: 1, completed: true }),
      scheduleApi.update({ id: 2, entryDate: "2026-09-20" }),
      scheduleApi.remove(3),
      scheduleApi.reorder({ entryDate: "2026-09-19", ids: [1, 2] }),
    ])
    await Promise.resolve()

    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(SCHEDULE_CHANGED_EVENT, listener)
  })

  it("写操作失败时不广播", async () => {
    const api = createApiMock()
    api.update.mockRejectedValue(new Error("boom"))
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }
    const listener = vi.fn()
    window.addEventListener(SCHEDULE_CHANGED_EVENT, listener)

    await expect(scheduleApi.update({ id: 1, completed: true })).rejects.toThrow("boom")
    await Promise.resolve()

    expect(listener).not.toHaveBeenCalled()
    window.removeEventListener(SCHEDULE_CHANGED_EVENT, listener)
  })
})
