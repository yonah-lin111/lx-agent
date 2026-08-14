import { NOTE_CARD_CHANNELS } from "@shared/ipc/noteCardChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener },
}))

describe("preload noteCard API", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    await import("../../src/preload/index")
  })

  it("暴露 noteCard API 并转发参数到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    const input = { title: "标题", content: "# 内容", tags: ["a"] }

    await api.noteCard.list()
    await api.noteCard.create(input)
    await api.noteCard.update("card-1", { title: "新标题" })
    await api.noteCard.delete("card-1")

    expect(exposeInMainWorld).toHaveBeenCalledWith("api", expect.any(Object))
    expect(invoke).toHaveBeenNthCalledWith(1, NOTE_CARD_CHANNELS.list)
    expect(invoke).toHaveBeenNthCalledWith(2, NOTE_CARD_CHANNELS.create, input)
    expect(invoke).toHaveBeenNthCalledWith(3, NOTE_CARD_CHANNELS.update, "card-1", {
      title: "新标题",
    })
    expect(invoke).toHaveBeenNthCalledWith(4, NOTE_CARD_CHANNELS.delete, "card-1")
  })
})
