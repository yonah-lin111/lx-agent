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
    await api.agent.send("你好", undefined, "/foo/proj")

    expect(exposeInMainWorld).toHaveBeenCalledWith("api", expect.any(Object))
    expect(invoke).toHaveBeenNthCalledWith(
      1,
      AGENT_CHANNELS.send,
      "你好",
      undefined,
      undefined,
      undefined,
    )
    expect(invoke).toHaveBeenNthCalledWith(2, AGENT_CHANNELS.abort)
    expect(invoke).toHaveBeenNthCalledWith(3, AGENT_CHANNELS.restore, [])
    expect(invoke).toHaveBeenNthCalledWith(
      4,
      AGENT_CHANNELS.send,
      "你好",
      undefined,
      "/foo/proj",
      undefined,
    )
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

  it("listSessions/restoreSession 转发到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]

    await api.agent.listSessions()
    await api.agent.restoreSession("sess-1")

    expect(invoke).toHaveBeenNthCalledWith(1, AGENT_CHANNELS.listSessions)
    expect(invoke).toHaveBeenNthCalledWith(2, AGENT_CHANNELS.restoreSession, "sess-1")
  })

  it("renameSession/deleteSession/deleteMessageTurn 转发参数到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]

    await api.agent.renameSession("sess-1", "标题")
    await api.agent.deleteSession("sess-1")
    await api.agent.deleteMessageTurn("sess-1", 123456)

    expect(invoke).toHaveBeenNthCalledWith(1, AGENT_CHANNELS.renameSession, "sess-1", "标题")
    expect(invoke).toHaveBeenNthCalledWith(2, AGENT_CHANNELS.deleteSession, "sess-1")
    expect(invoke).toHaveBeenNthCalledWith(3, AGENT_CHANNELS.deleteMessageTurn, "sess-1", 123456)
  })

  it("suggestedQuestions 转发上下文与排除列表到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    const messages = [
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好，有什么可以帮你？" },
    ]

    await api.agent.suggestedQuestions(messages)
    expect(invoke).toHaveBeenNthCalledWith(
      1,
      AGENT_CHANNELS.suggestedQuestions,
      messages,
      undefined,
    )

    await api.agent.suggestedQuestions(messages, ["旧问题"])
    expect(invoke).toHaveBeenNthCalledWith(2, AGENT_CHANNELS.suggestedQuestions, messages, [
      "旧问题",
    ])
  })

  it("getPromptAssembly 转发 sessionId 与 cwd 到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]

    await api.agent.getPromptAssembly("sess-1", "/foo/path")
    expect(invoke).toHaveBeenCalledWith(AGENT_CHANNELS.getPromptAssembly, "sess-1", "/foo/path")
  })
})
