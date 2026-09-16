import { ACTIVITY_CHANNELS } from "@shared/ipc/activityChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke },
}))

describe("preload activity API", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    await import("../../src/preload/index")
  })

  it("暴露 activity API 并转发到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]

    await api.activity.getDaily()

    expect(exposeInMainWorld).toHaveBeenCalledWith("api", expect.any(Object))
    expect(invoke).toHaveBeenCalledWith(ACTIVITY_CHANNELS.getDaily)
  })
})
