// @vitest-environment jsdom
import type { AgentEvent, AgentMessage, StopReason } from "@shared/contracts/agent"
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { agentApi } from "@/features/agent/api/agentApi"
import { useAgentChat } from "@/features/agent/hooks/useAgentChat"

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    onEvent: vi.fn(),
    abort: vi.fn(),
    send: vi.fn(),
  },
}))

type EventHandler = (event: AgentEvent) => void
let eventHandler: EventHandler

const user = (text: string, isSteer = false): AgentMessage =>
  ({
    role: "user",
    content: text,
    timestamp: 1,
    ...(isSteer ? { isSteer: true } : {}),
  }) as AgentMessage

const assistant = (text: string, stopReason: StopReason): AgentMessage =>
  ({
    role: "assistant",
    content: [{ type: "text", text }],
    provider: "p",
    model: "m",
    usage: { input: 0, output: 0, cacheRead: 0, totalTokens: 10 },
    stopReason,
    timestamp: 2,
  }) as unknown as AgentMessage

const streamingAssistant: AgentMessage = {
  role: "assistant",
  content: [{ type: "text", text: "正在生成..." }],
  provider: "p",
  model: "m",
  usage: { input: 0, output: 0, cacheRead: 0, totalTokens: 10 },
  stopReason: "pending",
  timestamp: 2,
}

describe("useAgentChat Steer 发送与停止 loading", () => {
  beforeEach(() => {
    vi.mocked(agentApi.onEvent).mockImplementation((handler) => {
      eventHandler = handler
      return () => {}
    })
    vi.mocked(agentApi.send).mockReset()
    vi.mocked(agentApi.abort).mockReset()
  })

  it("steer 发送时统一剥离 /steer 前缀，只把内容传给 main", async () => {
    vi.mocked(agentApi.send).mockResolvedValue({
      ok: true,
      steered: true,
      sessionId: "sess-1",
    } as never)
    const { result } = renderHook(() => useAgentChat())
    await act(async () => {})

    act(() => {
      result.current.setInputText("/steer 改为直接回答")
    })
    await act(async () => {})

    act(() => {
      result.current.sendMessage(undefined, undefined, { delivery: "steer" })
    })
    await act(async () => {})

    expect(vi.mocked(agentApi.send)).toHaveBeenCalledWith(
      "改为直接回答",
      undefined,
      expect.anything(),
      { delivery: "steer" },
    )
  })

  it("普通发送不受 /steer 剥离影响", async () => {
    vi.mocked(agentApi.send).mockResolvedValue({ ok: true, sessionId: "sess-1" } as never)
    const { result } = renderHook(() => useAgentChat())
    await act(async () => {})

    act(() => {
      result.current.setInputText("普通消息")
    })
    await act(async () => {})

    act(() => {
      result.current.sendMessage(undefined, undefined)
    })
    await act(async () => {})

    expect(vi.mocked(agentApi.send)).toHaveBeenCalledWith(
      "普通消息",
      undefined,
      expect.anything(),
      undefined,
    )
  })

  it("停止生成时立即清除流式标记并标记 aborted，消除残留 loading", async () => {
    const { result } = renderHook(() => useAgentChat())
    await act(async () => {})

    act(() => {
      eventHandler({ type: "message_start", message: streamingAssistant })
    })
    expect(result.current.messages[0]?.isStreaming).toBe(true)

    act(() => {
      result.current.stopStreaming()
    })

    expect(result.current.isStreaming).toBe(false)
    expect(result.current.messages[0]?.isStreaming).toBe(false)
    // 助手消息被标记为 aborted，驱动底部"已取消生成"黄色提示。
    expect(result.current.messages[0]?.stopReason).toBe("aborted")
  })

  it("steer 的 message_end（用户消息）不会覆盖正在流式的上一条助手消息", async () => {
    const { result } = renderHook(() => useAgentChat())
    await act(async () => {})

    // A 开始流式，随后 steer 用户消息的事件乱序到达（在 A 仍流式期间）。
    act(() => {
      eventHandler({ type: "agent_start" })
      eventHandler({ type: "message_start", message: user("原始", false) })
      eventHandler({ type: "message_start", message: assistant("第一轮回复", "pending") })
      eventHandler({ type: "message_start", message: user("插话内容", true) })
      eventHandler({ type: "message_end", message: user("插话内容", true) })
    })

    // 助手消息仍保留自身内容，未被 steer 内容覆盖。
    const firstAssistant = result.current.messages.find((m) => m.role === "assistant")
    expect(firstAssistant?.blocks).toEqual([{ kind: "text", text: "第一轮回复" }])

    // A 的 message_end 到达后正确收尾定型。
    act(() => {
      eventHandler({ type: "message_end", message: assistant("第一轮回复", "stop") })
    })
    const finalized = result.current.messages.find((m) => m.role === "assistant")
    expect(finalized?.isStreaming).toBe(false)
  })
})
