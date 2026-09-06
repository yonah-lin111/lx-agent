import { SETTINGS_CHANNELS } from "@shared/ipc/settingsChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.fn()

vi.mock("electron", () => ({ ipcMain: { handle } }))
vi.mock("@/services/settingsService", () => ({
  getModelProviderSettings: vi.fn(),
  saveModelProviderSettings: vi.fn(),
  getPermissionSettings: vi.fn(),
  savePermissionSettings: vi.fn(),
  getUiSettings: vi.fn(),
  saveUiSettings: vi.fn(),
  getCliSettings: vi.fn(),
  saveCliSettings: vi.fn(),
  getLspSettings: vi.fn(() => ({ languages: {} })),
  saveLspSettings: vi.fn(),
  getMcpSettings: vi.fn(() => ({ servers: {} })),
  saveMcpSettings: vi.fn(),
  getSkillSettings: vi.fn(() => ({ disabled: [] })),
  saveSkillSettings: vi.fn(),
  deleteSkill: vi.fn(),
  getVoiceSettings: vi.fn(() => ({ model: "whisper-large-v3-turbo" })),
  saveVoiceSettings: vi.fn(),
}))
vi.mock("@/services/voiceService", () => ({
  transcribeAudioWithGroq: vi.fn(),
}))
vi.mock("@/services/modelFetchService", () => ({
  fetchProviderModels: vi.fn(),
}))
vi.mock("@/services/cliToolService", () => ({
  getCliVersions: vi.fn(),
  runCliLifecycleAction: vi.fn(),
}))
vi.mock("@/agent/stream/modelFactory", () => ({
  invalidateModelCache: vi.fn(),
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
