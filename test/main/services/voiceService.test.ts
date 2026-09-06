import { beforeEach, describe, expect, it, vi } from "vitest"
import { transcribeAudioWithGroq } from "@/services/voiceService"

const mockGetVoiceSettings = vi.fn()

vi.mock("@/services/settingsService", () => ({
  getVoiceSettings: () => mockGetVoiceSettings(),
}))

describe("transcribeAudioWithGroq", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = originalFetch
  })

  it("当未配置 API Key 时抛出友好错误", async () => {
    mockGetVoiceSettings.mockReturnValue({
      apiKey: "",
      model: "whisper-large-v3-turbo",
      language: "auto",
    })

    await expect(
      transcribeAudioWithGroq({
        buffer: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow("Groq API key is not configured")
  })

  it("当音频 Buffer 为空时抛出错误", async () => {
    mockGetVoiceSettings.mockReturnValue({
      apiKey: "gsk_valid_key",
      model: "whisper-large-v3-turbo",
      language: "auto",
    })

    await expect(
      transcribeAudioWithGroq({
        buffer: new Uint8Array([]),
      }),
    ).rejects.toThrow("Audio buffer is empty")
  })

  it("成功调用 Groq API 并返回转录文本", async () => {
    mockGetVoiceSettings.mockReturnValue({
      apiKey: "gsk_valid_key",
      model: "whisper-large-v3-turbo",
      language: "zh",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: "这是一段语音测试",
        duration: 2.5,
        language: "zh",
      }),
    }) as unknown as typeof fetch

    const result = await transcribeAudioWithGroq({
      buffer: new Uint8Array([10, 20, 30]),
      mimeType: "audio/webm",
      fileName: "test.webm",
    })

    expect(result).toEqual({
      text: "这是一段语音测试",
      duration: 2.5,
      language: "zh",
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer gsk_valid_key",
        },
      }),
    )
  })

  it("当接口返回非 200 时解析错误信息并抛出", async () => {
    mockGetVoiceSettings.mockReturnValue({
      apiKey: "gsk_valid_key",
      model: "whisper-large-v3-turbo",
      language: "auto",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: "Invalid API Key" } }),
    }) as unknown as typeof fetch

    await expect(
      transcribeAudioWithGroq({
        buffer: new Uint8Array([10, 20]),
      }),
    ).rejects.toThrow("Groq Whisper transcription failed (401): Invalid API Key")
  })
})
