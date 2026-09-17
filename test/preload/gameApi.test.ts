import { GAME_CHANNELS } from "@shared/ipc/gameChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke },
}))

describe("preload game API", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    await import("../../src/preload/index")
  })

  it("暴露 game API 并通过共享 channel 转发全部方法", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    const saveBytes = new Uint8Array([1, 2, 3])

    await api.game.list()
    await api.game.importFromDialog()
    await api.game.rename(3, "标题")
    await api.game.remove(3)
    await api.game.markPlayed(3)
    await api.game.writeSave(3, saveBytes)
    await api.game.getRuntimeConfig()

    expect(exposeInMainWorld).toHaveBeenCalledWith("api", expect.any(Object))
    expect(invoke.mock.calls).toEqual([
      [GAME_CHANNELS.list],
      [GAME_CHANNELS.importFromDialog],
      [GAME_CHANNELS.rename, 3, "标题"],
      [GAME_CHANNELS.remove, 3],
      [GAME_CHANNELS.markPlayed, 3],
      [GAME_CHANNELS.writeSave, 3, saveBytes],
      [GAME_CHANNELS.getRuntimeConfig],
    ])
  })
})
