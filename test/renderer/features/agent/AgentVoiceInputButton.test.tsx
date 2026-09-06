// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AgentVoiceInputButton } from "@/features/agent/components/AgentInput/AgentVoiceInputButton"
import { settingsApi } from "@/features/settings/api/settingsApi"

const mockErrorToast = vi.fn()
const mockInfoToast = vi.fn()

vi.mock("@/components/ui/LxToast", () => ({
  useLxAgentToast: () => ({
    error: mockErrorToast,
    info: mockInfoToast,
  }),
}))

vi.mock("@/features/settings/api/settingsApi", () => ({
  settingsApi: {
    getVoiceSettings: vi.fn(),
    transcribeAudio: vi.fn(),
  },
}))

describe("AgentVoiceInputButton", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("当未配置 API Key 时点击提示错误 Toast", async () => {
    vi.mocked(settingsApi.getVoiceSettings).mockResolvedValue({
      apiKey: "",
      model: "whisper-large-v3-turbo",
      language: "auto",
    })

    const onTranscribed = vi.fn()
    const { getByRole } = render(<AgentVoiceInputButton onTranscribed={onTranscribed} />)

    const button = getByRole("button")
    await act(async () => {
      fireEvent.click(button)
    })

    await waitFor(() => {
      expect(mockErrorToast).toHaveBeenCalledWith(
        "Groq API Key is not configured. Please set it in Settings",
      )
    })
    expect(onTranscribed).not.toHaveBeenCalled()
  })

  it("配置了 API Key 但设备不支持麦克风时提示不支持", async () => {
    vi.mocked(settingsApi.getVoiceSettings).mockResolvedValue({
      apiKey: "gsk_test",
      model: "whisper-large-v3-turbo",
      language: "auto",
    })

    const originalMediaDevices = navigator.mediaDevices
    // @ts-expect-error - simulating unsupported device
    delete navigator.mediaDevices

    const onTranscribed = vi.fn()
    const { getByRole } = render(<AgentVoiceInputButton onTranscribed={onTranscribed} />)

    const button = getByRole("button")
    await act(async () => {
      fireEvent.click(button)
    })

    await waitFor(() => {
      expect(mockErrorToast).toHaveBeenCalledWith(
        "Microphone recording is not supported on this device",
      )
    })

    // 恢复 navigator.mediaDevices
    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true,
      writable: true,
    })
  })
})
