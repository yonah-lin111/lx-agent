import { PROMPT_HISTORY_CHANNELS } from "@shared/ipc/promptHistoryChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener },
}))

describe("preload promptHistory API", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    await import("../../src/preload/index")
  })

  it("暴露 promptHistory API 并转发参数到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]

    await api.promptHistory.get()
    await api.promptHistory.add("你好")

    expect(exposeInMainWorld).toHaveBeenCalledWith("api", expect.any(Object))
    expect(invoke).toHaveBeenNthCalledWith(1, PROMPT_HISTORY_CHANNELS.get)
    expect(invoke).toHaveBeenNthCalledWith(2, PROMPT_HISTORY_CHANNELS.add, "你好")
  })
})
