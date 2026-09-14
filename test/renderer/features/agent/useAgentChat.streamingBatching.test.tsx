// @vitest-environment jsdom
import type { AgentEvent, AgentMessage, StopReason, Usage } from "@shared/contracts/agent"
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agentApi } from "@/features/agent/api/agentApi"
import { useAgentChat } from "@/features/agent/hooks/useAgentChat"
import type { ChatMessage } from "@/features/agent/types"

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    onEvent: vi.fn(),
    abort: vi.fn(),
    send: vi.fn(),
  },
}))

type EventHandler = (event: AgentEvent) => void
let eventHandler: EventHandler

// 手动驱动的 rAF：测试内自行控制"帧提交"时机。
let frameCallbacks: Array<() => void> = []
const flushFrame = (): void => {
  const callbacks = frameCallbacks
  frameCallbacks = []
  act(() => {
    callbacks.forEach((callback) => callback())
  })
}

const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 10 }

const userMessage = (text: string): AgentMessage =>
  ({ role: "user", content: text, timestamp: 1 }) as AgentMessage

const assistantMessage = (content: unknown, stopReason: StopReason): AgentMessage =>
  ({
    role: "assistant",
    content,
    provider: "p",
    model: "m",
    usage,
    stopReason,
    timestamp: 2,
  }) as unknown as AgentMessage

const textOf = (message: ChatMessage | undefined): string =>
  (message?.blocks ?? [])
    .filter((block): block is Extract<ChatMessage["blocks"][number], { kind: "text" }> => {
      return block.kind === "text"
    })
    .map((block) => block.text)
    .join("")

const updateEvent = (text: string): AgentEvent =>
  ({
    type: "message_update",
    message: assistantMessage([{ type: "text", text }], "pending"),
    assistantMessageEvent: {},
  }) as unknown as AgentEvent

beforeEach(() => {
  frameCallbacks = []
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frameCallbacks.push(() => callback(0))
    return frameCallbacks.length
  })
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.mocked(agentApi.onEvent).mockImplementation((handler) => {
    eventHandler = handler
    return () => {}
  })
  vi.mocked(agentApi.send).mockReset()
  vi.mocked(agentApi.abort).mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("useAgentChat 流式事件按帧合并", () => {
  it("同一帧内的多次 message_update 合并为一次提交，且以最新分片为准", async () => {
    let renderCount = 0
    const { result } = renderHook(() => {
      renderCount++
      return useAgentChat()
    })
    await act(async () => {})

    act(() => {
      eventHandler({
        type: "message_start",
        message: assistantMessage([{ type: "text", text: "初始" }], "pending"),
      })
    })
    expect(textOf(result.current.messages[0])).toBe("初始")

    const rendersBeforeUpdates = renderCount
    act(() => {
      eventHandler(updateEvent("v1"))
      eventHandler(updateEvent("v2"))
      eventHandler(updateEvent("v3"))
    })

    // 帧未提交前不得触发状态更新。
    expect(textOf(result.current.messages[0])).toBe("初始")
    expect(renderCount).toBe(rendersBeforeUpdates)

    flushFrame()

    expect(textOf(result.current.messages[0])).toBe("v3")
    // 三次更新在同一个提交中合并为一次渲染。
    expect(renderCount).toBe(rendersBeforeUpdates + 1)
  })

  it("工具进度更新只替换命中消息，其余消息保持原引用", async () => {
    const { result } = renderHook(() => useAgentChat())
    await act(async () => {})

    act(() => {
      eventHandler({ type: "message_start", message: userMessage("开始") })
    })
    act(() => {
      eventHandler({
        type: "message_start",
        message: assistantMessage(
          [{ type: "toolCall", id: "call-1", name: "read", arguments: { file: "a.ts" } }],
          "pending",
        ),
      })
    })

    const before = result.current.messages
    expect(before).toHaveLength(2)

    act(() => {
      eventHandler({
        type: "tool_execution_update",
        toolCallId: "call-1",
        toolName: "read",
        args: { file: "a.ts" },
        partialResult: { content: [{ type: "text", text: "进度 42%" }] },
      } as unknown as AgentEvent)
    })
    flushFrame()

    // 未命中工具调用的消息引用保持稳定（不击穿 memo）。
    expect(result.current.messages[0]).toBe(before[0])
    expect(result.current.messages[1]).not.toBe(before[1])

    const toolBlock = result.current.messages[1].blocks.find(
      (block): block is Extract<ChatMessage["blocks"][number], { kind: "toolCall" }> =>
        block.kind === "toolCall",
    )
    expect(toolBlock?.progress).toBe("进度 42%")
  })

  it("同一帧内并行工具的进度更新互不覆盖", async () => {
    const { result } = renderHook(() => useAgentChat())
    await act(async () => {})

    act(() => {
      eventHandler({
        type: "message_start",
        message: assistantMessage(
          [
            { type: "toolCall", id: "call-1", name: "read", arguments: {} },
            { type: "toolCall", id: "call-2", name: "grep", arguments: {} },
          ],
          "pending",
        ),
      })
    })

    act(() => {
      eventHandler({
        type: "tool_execution_update",
        toolCallId: "call-1",
        toolName: "read",
        args: {},
        partialResult: { content: [{ type: "text", text: "read 进度" }] },
      } as unknown as AgentEvent)
      eventHandler({
        type: "tool_execution_update",
        toolCallId: "call-2",
        toolName: "grep",
        args: {},
        partialResult: { content: [{ type: "text", text: "grep 进度" }] },
      } as unknown as AgentEvent)
    })
    flushFrame()

    const blocks = result.current.messages[0].blocks.filter(
      (block): block is Extract<ChatMessage["blocks"][number], { kind: "toolCall" }> =>
        block.kind === "toolCall",
    )
    expect(blocks.find((block) => block.toolCallId === "call-1")?.progress).toBe("read 进度")
    expect(blocks.find((block) => block.toolCallId === "call-2")?.progress).toBe("grep 进度")
  })

  it("message_end 覆盖挂起分片，迟到的帧提交不会回写旧内容", async () => {
    const { result } = renderHook(() => useAgentChat())
    await act(async () => {})

    act(() => {
      eventHandler({
        type: "message_start",
        message: assistantMessage([{ type: "text", text: "开始" }], "pending"),
      })
    })
    act(() => {
      eventHandler(updateEvent("过期分片"))
    })
    act(() => {
      eventHandler({
        type: "message_end",
        message: assistantMessage([{ type: "text", text: "最终内容" }], "stop"),
      })
    })

    flushFrame()

    expect(textOf(result.current.messages[0])).toBe("最终内容")
    expect(result.current.messages[0]?.isStreaming).toBe(false)
  })
})
