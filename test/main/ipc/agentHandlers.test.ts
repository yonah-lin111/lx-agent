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
    listSessions: vi.fn(),
    restoreSession: vi.fn(),
    renameSession: vi.fn(),
    deleteSession: vi.fn(),
    deleteMessageTurn: vi.fn(),
    getPromptAssembly: vi.fn(),
  },
}))
vi.mock("@/agent/suggestedQuestionsGenerator", () => ({
  generateSuggestedQuestions: vi.fn(),
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
    expect(agentRunner.send).toHaveBeenCalledWith("你好", undefined, undefined, undefined)

    await sendHandler(undefined, "你好", undefined, { cwd: "/foo/proj" })
    expect(agentRunner.send).toHaveBeenCalledWith(
      "你好",
      undefined,
      { cwd: "/foo/proj" },
      undefined,
    )
  })

  it("listSessions/restoreSession handler 校验输入并转发到 agentRunner", async () => {
    vi.resetModules()
    const { registerAgentHandlers } = await import("@/ipc/agentHandlers")
    const { agentRunner } = await import("@/agent/agentRunner")

    registerAgentHandlers(() => undefined)

    const listHandler = handle.mock.calls.find(
      ([channel]) => channel === AGENT_CHANNELS.listSessions,
    )?.[1]
    const restoreHandler = handle.mock.calls.find(
      ([channel]) => channel === AGENT_CHANNELS.restoreSession,
    )?.[1]
    expect(listHandler).toBeTypeOf("function")
    expect(restoreHandler).toBeTypeOf("function")

    await listHandler(undefined)
    expect(agentRunner.listSessions).toHaveBeenCalledWith()

    await restoreHandler(undefined, "sess-1")
    expect(agentRunner.restoreSession).toHaveBeenCalledWith("sess-1")

    // 同步抛错（IPC 层会转为拒绝）校验非法输入。
    expect(() => restoreHandler(undefined, "")).toThrow("INVALID_SESSION_ID")
  })

  it("renameSession/deleteSession/deleteMessageTurn handler 校验并转发到 agentRunner", async () => {
    vi.resetModules()
    const { registerAgentHandlers } = await import("@/ipc/agentHandlers")
    const { agentRunner } = await import("@/agent/agentRunner")

    registerAgentHandlers(() => undefined)

    const renameHandler = handle.mock.calls.find(
      ([channel]) => channel === AGENT_CHANNELS.renameSession,
    )?.[1]
    const deleteHandler = handle.mock.calls.find(
      ([channel]) => channel === AGENT_CHANNELS.deleteSession,
    )?.[1]
    const turnHandler = handle.mock.calls.find(
      ([channel]) => channel === AGENT_CHANNELS.deleteMessageTurn,
    )?.[1]
    expect(renameHandler).toBeTypeOf("function")
    expect(deleteHandler).toBeTypeOf("function")
    expect(turnHandler).toBeTypeOf("function")

    renameHandler(undefined, "sess-1", "标题")
    expect(agentRunner.renameSession).toHaveBeenCalledWith("sess-1", "标题")

    deleteHandler(undefined, "sess-1")
    expect(agentRunner.deleteSession).toHaveBeenCalledWith("sess-1")

    turnHandler(undefined, "sess-1", 123456)
    expect(agentRunner.deleteMessageTurn).toHaveBeenCalledWith("sess-1", 123456)

    // 非法输入同步抛错。
    expect(() => renameHandler(undefined, "", "标题")).toThrow("INVALID_SESSION_ID")
    expect(() => renameHandler(undefined, "sess-1", "  ")).toThrow("INVALID_SESSION_TITLE")
    expect(() => renameHandler(undefined, "sess-1", "x".repeat(41))).toThrow(
      "INVALID_SESSION_TITLE",
    )
    expect(() => deleteHandler(undefined, "")).toThrow("INVALID_SESSION_ID")
    expect(() => turnHandler(undefined, "", 1)).toThrow("INVALID_SESSION_ID")
    expect(() => turnHandler(undefined, "sess-1", "abc")).toThrow("INVALID_MESSAGE_TIMESTAMP")
  })

  it("suggestedQuestions handler 校验输入并调用生成器", async () => {
    vi.resetModules()
    const { registerAgentHandlers } = await import("@/ipc/agentHandlers")
    const { generateSuggestedQuestions } = await import("@/agent/suggestedQuestionsGenerator")

    registerAgentHandlers(() => undefined)

    const handler = handle.mock.calls.find(
      ([channel]) => channel === AGENT_CHANNELS.suggestedQuestions,
    )?.[1]
    expect(handler).toBeTypeOf("function")

    // 非法上下文返回空数组，不触发生成器。
    const invalidResult = await handler(undefined, "not-an-array")
    expect(invalidResult).toEqual([])
    expect(generateSuggestedQuestions).not.toHaveBeenCalled()

    const messages = [{ role: "user", content: "你好" }]
    vi.mocked(generateSuggestedQuestions).mockResolvedValue(["问题一", "问题二"])
    const result = await handler(undefined, messages, ["旧问题"])
    expect(generateSuggestedQuestions).toHaveBeenCalledWith(messages, ["旧问题"])
    expect(result).toEqual(["问题一", "问题二"])
  })
})
