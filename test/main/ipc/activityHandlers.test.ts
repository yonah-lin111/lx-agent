import { ACTIVITY_CHANNELS } from "@shared/ipc/activityChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.fn()

vi.mock("electron", () => ({ ipcMain: { handle } }))
vi.mock("@/services/activityService", () => ({
  activityService: {
    getDaily: vi.fn().mockReturnValue([{ date: "2026-09-16", count: 2 }]),
  },
}))

describe("activity IPC handlers", () => {
  beforeEach(() => {
    handle.mockClear()
  })

  it("为共享活动 channel 注册 handler 并转发每日会话数据", async () => {
    const { registerActivityHandlers } = await import("@/ipc/activityHandlers")
    const { activityService } = await import("@/services/activityService")
    const dailyHandler = vi.fn()

    handle.mockImplementation((channel, handler) => {
      if (channel === ACTIVITY_CHANNELS.getDaily) dailyHandler.mockImplementation(handler)
    })

    registerActivityHandlers()

    expect(handle).toHaveBeenCalledTimes(Object.keys(ACTIVITY_CHANNELS).length)
    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual(
      Object.values(ACTIVITY_CHANNELS).sort(),
    )

    expect(dailyHandler({})).toEqual([{ date: "2026-09-16", count: 2 }])
    expect(activityService.getDaily).toHaveBeenCalledTimes(1)
  })
})
