import { AGENT_CHANNELS } from "@shared/ipc/agentChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.fn()
const send = vi.fn()

vi.mock("electron", () => ({ ipcMain: { handle }, WebContents: class {} }))
vi.mock("@/agent/agentRunner", () => ({
  agentRunner: {
    attachEventSink: vi.fn(),
    send: vi.fn(),
    abort: vi.fn(),
    restoreMessages: vi.fn(),
  },
}))

describe("agent IPC handlers", () => {
  beforeEach(() => handle.mockClear())

  it("为共享 agent channel 注册所有 invoke handler（event 为推送 channel）", async () => {
    const { registerAgentHandlers } = await import("@/ipc/agentHandlers")

    registerAgentHandlers(() => ({ send, isDestroyed: () => false }) as never)

    const invokeChannels = Object.values(AGENT_CHANNELS).filter(
      (channel) => channel !== AGENT_CHANNELS.event,
    )
    expect(handle).toHaveBeenCalledTimes(invokeChannels.length)
    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual([...invokeChannels].sort())
  })

  it("send handler 校验输入并转发到 agentRunner", async () => {
    vi.resetModules()
    const { registerAgentHandlers } = await import("@/ipc/agentHandlers")
    const { agentRunner } = await import("@/agent/agentRunner")

    registerAgentHandlers(() => undefined)

    const sendHandler = handle.mock.calls.find(([channel]) => channel === AGENT_CHANNELS.send)?.[1]
    expect(sendHandler).toBeTypeOf("function")

    const invalidResult = await sendHandler(undefined, "   ")
    expect(invalidResult).toEqual({ ok: false, error: expect.any(String) })

    await sendHandler(undefined, "你好")
    expect(agentRunner.send).toHaveBeenCalledWith("你好")
  })
})
