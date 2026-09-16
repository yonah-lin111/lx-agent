import { SETTINGS_CHANNELS } from "@shared/ipc/settingsChannels"
import type { TokenSaverSettings } from "@shared/settings"
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

describe("preload settings API - tokenSaver", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    await import("../../src/preload/index")
  })

  it("暴露 tokenSaver 设置 API 并正确转发至 IPC channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    expect(api.settings).toBeDefined()

    await api.settings.getTokenSaverSettings()
    expect(invoke).toHaveBeenNthCalledWith(1, SETTINGS_CHANNELS.getTokenSaverSettings)

    const settings: TokenSaverSettings = {
      rtkEnabled: true,
      cavemanEnabled: false,
      cavemanLevel: "full",
      ponytailEnabled: false,
      ponytailLevel: "full",
    }
    await api.settings.saveTokenSaverSettings(settings)
    expect(invoke).toHaveBeenNthCalledWith(2, SETTINGS_CHANNELS.saveTokenSaverSettings, settings)
  })
})
