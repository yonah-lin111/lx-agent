import { USAGE_CHANNELS } from "@shared/ipc/usageChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener },
}))

describe("preload usage API", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    await import("../../src/preload/index")
  })

  it("暴露 usage API 并转发查询参数到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    const query = { startTime: 1, provider: "anthropic" }

    await api.usage.getSummary(query)
    await api.usage.getDaily(query)
    await api.usage.getDaily(query, "hour")
    await api.usage.getModelStats(query)
    await api.usage.getProviderStats(query)
    await api.usage.getFilterOptions(query)
    await api.usage.listLogs(query, 2, 50)

    expect(invoke).toHaveBeenCalledWith(USAGE_CHANNELS.getSummary, query)
    expect(invoke).toHaveBeenCalledWith(USAGE_CHANNELS.getDaily, query, undefined)
    expect(invoke).toHaveBeenCalledWith(USAGE_CHANNELS.getDaily, query, "hour")
    expect(invoke).toHaveBeenCalledWith(USAGE_CHANNELS.getModelStats, query)
    expect(invoke).toHaveBeenCalledWith(USAGE_CHANNELS.getProviderStats, query)
    expect(invoke).toHaveBeenCalledWith(USAGE_CHANNELS.getFilterOptions, query)
    expect(invoke).toHaveBeenCalledWith(USAGE_CHANNELS.listLogs, query, 2, 50)
  })

  it("onLogRecorded 订阅事件并返回退订函数", () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    const handler = vi.fn()

    const unsubscribe = api.usage.onLogRecorded(handler)

    expect(on).toHaveBeenCalledWith(USAGE_CHANNELS.event, expect.any(Function))
    const listener = on.mock.calls[0][1] as () => void
    listener()
    expect(handler).toHaveBeenCalledTimes(1)

    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith(USAGE_CHANNELS.event, listener)
  })
})
