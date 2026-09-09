import { OVERVIEW_CHANNELS } from "@shared/ipc/overviewChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke },
}))

describe("preload overview API", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    await import("../../src/preload/index")
  })

  it("暴露 overview API 并转发参数到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    const input = { projectId: "project-abc" }

    await api.overview.getStats(input)

    expect(exposeInMainWorld).toHaveBeenCalledWith("api", expect.any(Object))
    expect(invoke).toHaveBeenCalledWith(OVERVIEW_CHANNELS.getStats, input)
  })
})
