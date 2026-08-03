import type { AgentEvent } from "@shared/contracts/agent"
import { AGENT_CHANNELS } from "@shared/ipc/agentChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener },
}))

describe("preload agent API", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    await import("../../src/preload/index")
  })

  it("暴露 agent API 并转发参数到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]

    await api.agent.send("你好")
    await api.agent.abort()
    await api.agent.restore([])

    expect(exposeInMainWorld).toHaveBeenCalledWith("api", expect.any(Object))
    expect(invoke).toHaveBeenNthCalledWith(1, AGENT_CHANNELS.send, "你好")
    expect(invoke).toHaveBeenNthCalledWith(2, AGENT_CHANNELS.abort)
    expect(invoke).toHaveBeenNthCalledWith(3, AGENT_CHANNELS.restore, [])
  })

  it("onEvent 订阅 agent:event 并返回取消函数", () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    const handler = vi.fn()

    const unsubscribe = api.agent.onEvent(handler)

    expect(on).toHaveBeenCalledWith(AGENT_CHANNELS.event, expect.any(Function))
    const listener = on.mock.calls[0]?.[1]
    const event: AgentEvent = { type: "agent_start" }
    listener(undefined, event)
    expect(handler).toHaveBeenCalledWith(event)

    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith(AGENT_CHANNELS.event, listener)
  })
})
