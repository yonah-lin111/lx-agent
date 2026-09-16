import { SCHEDULE_CHANNELS } from "@shared/ipc/scheduleChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke },
}))

describe("preload schedule API", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    await import("../../src/preload/index")
  })

  it("暴露 schedule API 并把各方法转发到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]

    await api.schedule.listByDate({ entryDate: "2026-09-16" })
    expect(invoke).toHaveBeenCalledWith(SCHEDULE_CHANNELS.listByDate, {
      entryDate: "2026-09-16",
    })

    await api.schedule.create({ entryDate: "2026-09-16", content: "A", priority: "P2" })
    expect(invoke).toHaveBeenCalledWith(SCHEDULE_CHANNELS.create, {
      entryDate: "2026-09-16",
      content: "A",
      priority: "P2",
    })

    await api.schedule.update({ id: 1, completed: true })
    expect(invoke).toHaveBeenCalledWith(SCHEDULE_CHANNELS.update, { id: 1, completed: true })

    await api.schedule.remove(3)
    expect(invoke).toHaveBeenCalledWith(SCHEDULE_CHANNELS.remove, 3)

    await api.schedule.reorder({ entryDate: "2026-09-16", ids: [2, 1] })
    expect(invoke).toHaveBeenCalledWith(SCHEDULE_CHANNELS.reorder, {
      entryDate: "2026-09-16",
      ids: [2, 1],
    })

    await api.schedule.listRangeStats({ startDate: "2026-09-10", endDate: "2026-09-16" })
    expect(invoke).toHaveBeenCalledWith(SCHEDULE_CHANNELS.listRangeStats, {
      startDate: "2026-09-10",
      endDate: "2026-09-16",
    })
  })
})
