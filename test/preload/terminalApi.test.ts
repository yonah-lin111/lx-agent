import { TERMINAL_CHANNELS } from "@shared/ipc/terminalChannels"
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

describe("preload terminal API", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    await import("../../src/preload/index")
  })

  it("暴露 terminal API 并转发参数到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    expect(api?.terminal).toBeDefined()

    await api.terminal.create({ id: "term-1", cwd: "/test" })
    await api.terminal.write("term-1", "ls\n")
    await api.terminal.resize("term-1", 100, 30)
    await api.terminal.kill("term-1")
    await api.terminal.getDesktopPath()
    await api.terminal.hasRunningProcess("term-1")

    expect(invoke).toHaveBeenNthCalledWith(1, TERMINAL_CHANNELS.create, {
      id: "term-1",
      cwd: "/test",
    })
    expect(invoke).toHaveBeenNthCalledWith(2, TERMINAL_CHANNELS.write, "term-1", "ls\n")
    expect(invoke).toHaveBeenNthCalledWith(3, TERMINAL_CHANNELS.resize, "term-1", 100, 30)
    expect(invoke).toHaveBeenNthCalledWith(4, TERMINAL_CHANNELS.kill, "term-1")
    expect(invoke).toHaveBeenNthCalledWith(5, TERMINAL_CHANNELS.getDesktopPath)
    expect(invoke).toHaveBeenNthCalledWith(6, TERMINAL_CHANNELS.hasRunningProcess, "term-1")
  })

  it("支持订阅并正确解绑 onData 与 onExit 事件", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    const dataHandler = vi.fn()
    const exitHandler = vi.fn()

    const unsubData = api.terminal.onData("term-1", dataHandler)
    const unsubExit = api.terminal.onExit("term-1", exitHandler)

    expect(on).toHaveBeenCalledWith(TERMINAL_CHANNELS.data("term-1"), expect.any(Function))
    expect(on).toHaveBeenCalledWith(TERMINAL_CHANNELS.exit("term-1"), expect.any(Function))

    unsubData()
    unsubExit()

    expect(removeListener).toHaveBeenCalledWith(
      TERMINAL_CHANNELS.data("term-1"),
      expect.any(Function),
    )
    expect(removeListener).toHaveBeenCalledWith(
      TERMINAL_CHANNELS.exit("term-1"),
      expect.any(Function),
    )
  })
})
