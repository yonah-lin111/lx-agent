import { OPENCLAW_CHANNELS } from "@shared/ipc/openclawChannels"
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

describe("preload openclaw API", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    await import("../../src/preload/index")
  })

  it("暴露 openclaw API 并转发会话与绑定参数到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    expect(api?.openclaw).toBeDefined()

    await api.openclaw.connect("local")
    await api.openclaw.disconnect("local")
    await api.openclaw.fetchAgents("local")
    await api.openclaw.getSnapshot("local", "lily")
    await api.openclaw.listSessions("local", "lily")
    await api.openclaw.createSession("local", "lily")
    await api.openclaw.bindSession("local", "lily", "agent:lily:main")
    await api.openclaw.sendMessage({ instanceId: "local", agentId: "lily", message: "hi" })
    await api.openclaw.abort("local", "lily")

    expect(invoke).toHaveBeenNthCalledWith(1, OPENCLAW_CHANNELS.connect, "local")
    expect(invoke).toHaveBeenNthCalledWith(2, OPENCLAW_CHANNELS.disconnect, "local")
    expect(invoke).toHaveBeenNthCalledWith(3, OPENCLAW_CHANNELS.fetchAgents, "local")
    expect(invoke).toHaveBeenNthCalledWith(4, OPENCLAW_CHANNELS.getSnapshot, "local", "lily")
    expect(invoke).toHaveBeenNthCalledWith(5, OPENCLAW_CHANNELS.listSessions, "local", "lily")
    expect(invoke).toHaveBeenNthCalledWith(6, OPENCLAW_CHANNELS.createSession, "local", "lily")
    expect(invoke).toHaveBeenNthCalledWith(
      7,
      OPENCLAW_CHANNELS.bindSession,
      "local",
      "lily",
      "agent:lily:main",
    )
    expect(invoke).toHaveBeenNthCalledWith(8, OPENCLAW_CHANNELS.sendMessage, {
      instanceId: "local",
      agentId: "lily",
      message: "hi",
    })
    expect(invoke).toHaveBeenNthCalledWith(9, OPENCLAW_CHANNELS.abort, "local", "lily")
  })

  it("订阅会话事件并支持退订", () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    const handler = vi.fn()

    const unsubscribe = api.openclaw.onEvent(handler)

    expect(on).toHaveBeenCalledWith(OPENCLAW_CHANNELS.event, expect.any(Function))
    const listener = on.mock.calls[0]?.[1] as (event: unknown, payload: unknown) => void
    listener({}, { kind: "snapshot" })
    expect(handler).toHaveBeenCalledWith({ kind: "snapshot" })

    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith(OPENCLAW_CHANNELS.event, expect.any(Function))
  })
})
