import { USAGE_CHANNELS } from "@shared/ipc/usageChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.fn()
const setUsageLogRecordedListener = vi.fn()

vi.mock("electron", () => ({ ipcMain: { handle } }))
vi.mock("@/agent/usageRecorder", () => ({ setUsageLogRecordedListener }))
vi.mock("@/services/usageLogService", () => ({
  usageLogService: {
    listLogs: vi.fn(),
    getSummary: vi.fn(),
    getDaily: vi.fn(),
    getModelStats: vi.fn(),
    getProviderStats: vi.fn(),
    getFilterOptions: vi.fn(),
  },
}))

// usage:event 为单向推送通道，不作为 handle 注册。
const INVOKE_CHANNELS = Object.values(USAGE_CHANNELS).filter(
  (channel) => channel !== USAGE_CHANNELS.event,
)

describe("usage IPC handlers", () => {
  beforeEach(() => {
    handle.mockClear()
    setUsageLogRecordedListener.mockClear()
  })

  it("为共享用量 channel 注册所有 handler 并挂载事件推送", async () => {
    const { registerUsageHandlers } = await import("@/ipc/usageHandlers")
    const getWebContents = vi.fn().mockReturnValue(undefined)

    registerUsageHandlers(getWebContents)

    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual(INVOKE_CHANNELS.sort())
    expect(setUsageLogRecordedListener).toHaveBeenCalledTimes(1)
  })

  it("日志写入事件推送到窗口", async () => {
    const { registerUsageHandlers } = await import("@/ipc/usageHandlers")
    const send = vi.fn()
    const getWebContents = vi.fn().mockReturnValue({ send, isDestroyed: () => false })

    registerUsageHandlers(getWebContents)
    const listener = setUsageLogRecordedListener.mock.calls[0][0] as () => void
    listener()

    expect(send).toHaveBeenCalledWith(USAGE_CHANNELS.event, { type: "logRecorded" })
  })

  it("校验并转发查询与分页参数", async () => {
    const { usageLogService } = await import("@/services/usageLogService")
    const { registerUsageHandlers } = await import("@/ipc/usageHandlers")
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    handle.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    })

    registerUsageHandlers(() => undefined)

    const listLogs = handlers.get(USAGE_CHANNELS.listLogs)!
    listLogs({}, { startTime: 100, endTime: 200, provider: " p1 ", projectId: "proj" }, 2, 10)
    expect(usageLogService.listLogs).toHaveBeenCalledWith(
      { startTime: 100, endTime: 200, provider: "p1", model: undefined, projectId: "proj" },
      2,
      10,
    )

    const getSummary = handlers.get(USAGE_CHANNELS.getSummary)!
    getSummary({}, undefined)
    expect(usageLogService.getSummary).toHaveBeenCalledWith({
      startTime: undefined,
      endTime: undefined,
      provider: undefined,
      model: undefined,
      projectId: undefined,
    })

    const getDaily = handlers.get(USAGE_CHANNELS.getDaily)!
    getDaily({}, { provider: "p1" }, "hour")
    expect(usageLogService.getDaily).toHaveBeenCalledWith(
      {
        startTime: undefined,
        endTime: undefined,
        provider: "p1",
        model: undefined,
        projectId: undefined,
      },
      "hour",
    )
    getDaily({}, undefined, undefined)
    expect(usageLogService.getDaily).toHaveBeenLastCalledWith(expect.anything(), "day")
    expect(() => getDaily({}, {}, "week")).toThrow("INVALID_USAGE_QUERY")

    expect(() => getSummary({}, "invalid")).toThrow("INVALID_USAGE_QUERY")
    expect(() => getSummary({}, { startTime: -1 })).toThrow("INVALID_USAGE_QUERY")
    expect(() => listLogs({}, {}, 0, 10)).toThrow("INVALID_USAGE_QUERY")

    // 分页参数收敛到合法范围。
    listLogs({}, {}, 1, 9999)
    expect(usageLogService.listLogs).toHaveBeenLastCalledWith(expect.anything(), 1, 200)
  })
})
