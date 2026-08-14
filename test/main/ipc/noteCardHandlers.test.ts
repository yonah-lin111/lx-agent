import { NOTE_CARD_CHANNELS } from "@shared/ipc/noteCardChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.fn()

vi.mock("electron", () => ({ ipcMain: { handle } }))
vi.mock("@/services/noteCardService", () => ({
  noteCardService: {
    listNoteCards: vi.fn(),
    createNoteCard: vi.fn(),
    updateNoteCard: vi.fn(),
    deleteNoteCard: vi.fn(),
  },
}))

describe("noteCard IPC handlers", () => {
  beforeEach(() => handle.mockClear())

  it("为共享笔记卡片 channel 注册所有 handler", async () => {
    const { registerNoteCardHandlers } = await import("@/ipc/noteCardHandlers")

    registerNoteCardHandlers()

    expect(handle).toHaveBeenCalledTimes(Object.keys(NOTE_CARD_CHANNELS).length)
    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual(
      Object.values(NOTE_CARD_CHANNELS).sort(),
    )
  })

  it("校验并转发创建参数", async () => {
    const { noteCardService } = await import("@/services/noteCardService")
    const { registerNoteCardHandlers } = await import("@/ipc/noteCardHandlers")
    const createHandler = vi.fn()
    handle.mockImplementation((channel, handler) => {
      if (channel === NOTE_CARD_CHANNELS.create) createHandler.mockImplementation(handler)
    })

    registerNoteCardHandlers()

    createHandler({}, { title: "标题", content: "# 内容", tags: ["a"] })
    expect(noteCardService.createNoteCard).toHaveBeenCalledWith({
      title: "标题",
      content: "# 内容",
      tags: ["a"],
    })
    expect(() => createHandler({}, { title: "标题" })).toThrow("INVALID_NOTE_CARD_INPUT")
    expect(() => createHandler({}, null)).toThrow("INVALID_NOTE_CARD_INPUT")
  })

  it("校验并转发更新与删除参数", async () => {
    const { noteCardService } = await import("@/services/noteCardService")
    const { registerNoteCardHandlers } = await import("@/ipc/noteCardHandlers")
    const updateHandler = vi.fn()
    const deleteHandler = vi.fn()
    handle.mockImplementation((channel, handler) => {
      if (channel === NOTE_CARD_CHANNELS.update) updateHandler.mockImplementation(handler)
      if (channel === NOTE_CARD_CHANNELS.delete) deleteHandler.mockImplementation(handler)
    })

    registerNoteCardHandlers()

    updateHandler({}, "card-1", { title: "新标题" })
    expect(noteCardService.updateNoteCard).toHaveBeenCalledWith("card-1", { title: "新标题" })
    expect(() => updateHandler({}, 1, { title: "x" })).toThrow("INVALID_NOTE_CARD_INPUT")
    expect(() => updateHandler({}, "card-1", null)).toThrow("INVALID_NOTE_CARD_INPUT")

    deleteHandler({}, "card-1")
    expect(noteCardService.deleteNoteCard).toHaveBeenCalledWith("card-1")
    expect(() => deleteHandler({}, 1)).toThrow("INVALID_NOTE_CARD_ID")
  })
})
