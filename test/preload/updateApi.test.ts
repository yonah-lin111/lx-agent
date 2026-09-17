import { UPDATE_CHANNELS } from "@shared/ipc/updateChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener },
}))

describe("preload update API", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    await import("../../src/preload/index")
  })

  it("getState / check 走对应 IPC 通道", () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]

    api.update.getState()
    expect(invoke).toHaveBeenCalledWith(UPDATE_CHANNELS.getState)

    api.update.check()
    expect(invoke).toHaveBeenCalledWith(UPDATE_CHANNELS.check)
  })

  it("onStateChanged 订阅状态推送并返回取消函数", () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    const handler = vi.fn()
    const state = {
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      hasUpdate: true,
      releaseUrl: "https://github.com/yonah-lin111/lx-agent/releases/tag/v0.2.0",
      checkedAt: 1,
      failed: false,
    }

    const unsubscribe = api.update.onStateChanged(handler)

    expect(on).toHaveBeenCalledWith(UPDATE_CHANNELS.stateChanged, expect.any(Function))
    const listener = on.mock.calls[0]?.[1]
    listener({}, state)
    expect(handler).toHaveBeenCalledWith(state)

    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith(UPDATE_CHANNELS.stateChanged, listener)
  })
})
