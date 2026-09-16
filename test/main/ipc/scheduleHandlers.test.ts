import { SCHEDULE_CHANNELS } from "@shared/ipc/scheduleChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.fn()

vi.mock("electron", () => ({ ipcMain: { handle } }))
vi.mock("@/services/scheduleService", () => ({
  scheduleService: {
    listByDate: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    reorder: vi.fn(),
    listRangeStats: vi.fn(),
  },
}))

describe("schedule IPC handlers", () => {
  beforeEach(() => {
    handle.mockClear()
  })

  it("为共享日程 channel 注册所有 handler", async () => {
    const { registerScheduleHandlers } = await import("@/ipc/scheduleHandlers")

    registerScheduleHandlers()

    expect(handle).toHaveBeenCalledTimes(Object.keys(SCHEDULE_CHANNELS).length)
    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual(
      Object.values(SCHEDULE_CHANNELS).sort(),
    )
  })

  it("校验对象输入并转发到 service", async () => {
    const { scheduleService } = await import("@/services/scheduleService")
    const { registerScheduleHandlers } = await import("@/ipc/scheduleHandlers")
    const handlers = new Map<string, (event: unknown, input: unknown) => unknown>()

    handle.mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })

    registerScheduleHandlers()

    const input = { entryDate: "2026-09-16" }
    handlers.get(SCHEDULE_CHANNELS.listByDate)?.({}, input)
    expect(scheduleService.listByDate).toHaveBeenCalledWith(input)

    expect(() => handlers.get(SCHEDULE_CHANNELS.create)?.({}, "invalid")).toThrow(
      "INVALID_SCHEDULE_INPUT",
    )

    handlers.get(SCHEDULE_CHANNELS.remove)?.({}, 12)
    expect(scheduleService.remove).toHaveBeenCalledWith(12)
  })
})
