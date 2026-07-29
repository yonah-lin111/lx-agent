import { SETTINGS_CHANNELS } from "@shared/ipc/settingsChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.fn()

vi.mock("electron", () => ({ ipcMain: { handle } }))
vi.mock("@/services/settingsService", () => ({
  getModelProviderSettings: vi.fn(),
  saveModelProviderSettings: vi.fn(),
}))

describe("settings IPC handlers", () => {
  beforeEach(() => handle.mockClear())

  it("为共享设置 channel 注册所有 handler", async () => {
    const { registerSettingsHandlers } = await import("@/ipc/settingsHandlers")

    registerSettingsHandlers()

    expect(handle).toHaveBeenCalledTimes(Object.keys(SETTINGS_CHANNELS).length)
    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual(
      Object.values(SETTINGS_CHANNELS).sort(),
    )
  })
})
