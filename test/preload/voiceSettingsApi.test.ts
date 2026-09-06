import { SETTINGS_CHANNELS } from "@shared/ipc/settingsChannels"
import type { TranscribeAudioInput, VoiceSettings } from "@shared/settings"
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

describe("preload settings API - voice", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    await import("../../src/preload/index")
  })

  it("暴露 voice settings 与 transcribeAudio API 并正确转发至 IPC channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    expect(api.settings).toBeDefined()

    const mockVoiceSettings: VoiceSettings = {
      apiKey: "gsk_test",
      model: "whisper-large-v3-turbo",
      language: "zh",
    }

    await api.settings.getVoiceSettings()
    expect(invoke).toHaveBeenNthCalledWith(1, SETTINGS_CHANNELS.getVoiceSettings)

    await api.settings.saveVoiceSettings(mockVoiceSettings)
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      SETTINGS_CHANNELS.saveVoiceSettings,
      mockVoiceSettings,
    )

    const transcribeInput: TranscribeAudioInput = {
      buffer: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm",
      fileName: "audio.webm",
    }
    await api.settings.transcribeAudio(transcribeInput)
    expect(invoke).toHaveBeenNthCalledWith(3, SETTINGS_CHANNELS.transcribeAudio, transcribeInput)
  })
})
