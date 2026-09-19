import { SETTINGS_CHANNELS } from "@shared/ipc/settingsChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener },
  webUtils: { getPathForFile: vi.fn() },
}))

describe("preload settings API - subagent capabilities", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    await import("../../src/preload/index")
  })

  it("暴露子代理能力目录 API 并转发至共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    expect(api.settings.getSubagentCapabilities).toBeTypeOf("function")

    await api.settings.getSubagentCapabilities()
    expect(invoke).toHaveBeenCalledWith(SETTINGS_CHANNELS.getSubagentCapabilities)
  })
})
