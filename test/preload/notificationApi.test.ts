import { NOTIFICATION_CHANNELS } from "@shared/ipc/notificationChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const exposeInMainWorld = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { on, removeListener },
}))

describe("preload notification API", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    on.mockReset()
    removeListener.mockReset()
    await import("../../src/preload/index")
  })

  it("onClick 订阅 notification:click 并转发负载，返回取消函数", () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    const handler = vi.fn()

    const unsubscribe = api.notification.onClick(handler)

    expect(on).toHaveBeenCalledWith(NOTIFICATION_CHANNELS.click, expect.any(Function))
    const listener = on.mock.calls[0]?.[1]
    listener({}, { source: "openclaw", instanceId: "i1", agentId: "a1" })
    expect(handler).toHaveBeenCalledWith({ source: "openclaw", instanceId: "i1", agentId: "a1" })

    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith(NOTIFICATION_CHANNELS.click, listener)
  })
})
