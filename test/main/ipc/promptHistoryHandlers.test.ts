import { PROMPT_HISTORY_CHANNELS } from "@shared/ipc/promptHistoryChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.fn()

vi.mock("electron", () => ({ ipcMain: { handle } }))
vi.mock("@/services/promptHistoryService", () => ({
  getPromptHistory: vi.fn(),
  addPromptHistory: vi.fn(),
}))

describe("promptHistory IPC handlers", () => {
  beforeEach(() => handle.mockClear())

  it("为共享提示词历史 channel 注册所有 handler", async () => {
    const { registerPromptHistoryHandlers } = await import("@/ipc/promptHistoryHandlers")

    registerPromptHistoryHandlers()

    expect(handle).toHaveBeenCalledTimes(Object.keys(PROMPT_HISTORY_CHANNELS).length)
    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual(
      Object.values(PROMPT_HISTORY_CHANNELS).sort(),
    )
  })
})
