import { OVERVIEW_CHANNELS } from "@shared/ipc/overviewChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.fn()

vi.mock("electron", () => ({ ipcMain: { handle } }))
vi.mock("@/services/overviewService", () => ({
  overviewService: {
    getStats: vi.fn(),
  },
}))

describe("overview IPC handlers", () => {
  beforeEach(() => {
    handle.mockClear()
  })

  it("为共享概览 channel 注册所有 handler", async () => {
    const { registerOverviewHandlers } = await import("@/ipc/overviewHandlers")

    registerOverviewHandlers()

    expect(handle).toHaveBeenCalledTimes(Object.keys(OVERVIEW_CHANNELS).length)
    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual(
      Object.values(OVERVIEW_CHANNELS).sort(),
    )
  })

  it("校验并转发概览查询参数", async () => {
    const { overviewService } = await import("@/services/overviewService")
    const { registerOverviewHandlers } = await import("@/ipc/overviewHandlers")
    const statsHandler = vi.fn()

    handle.mockImplementation((channel, handler) => {
      if (channel === OVERVIEW_CHANNELS.getStats) statsHandler.mockImplementation(handler)
    })

    registerOverviewHandlers()

    statsHandler({}, { projectId: "project-1" })
    expect(overviewService.getStats).toHaveBeenCalledWith({ projectId: "project-1" })

    statsHandler({}, undefined)
    expect(overviewService.getStats).toHaveBeenCalledWith({ projectId: undefined })

    expect(() => statsHandler({}, "invalid_string_input")).toThrow("INVALID_OVERVIEW_INPUT")
  })
})
