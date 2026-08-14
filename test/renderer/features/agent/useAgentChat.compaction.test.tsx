// @vitest-environment jsdom
import type { AgentEvent, AgentMessage } from "@shared/contracts/agent"
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { agentApi } from "@/features/agent/api/agentApi"
import { useAgentChat } from "@/features/agent/hooks/useAgentChat"

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    onEvent: vi.fn(),
    compact: vi.fn(),
    undoCompaction: vi.fn(),
    abort: vi.fn(),
    restore: vi.fn(),
    restoreSession: vi.fn(),
    getContextUsage: vi.fn(),
    continue: vi.fn(),
    send: vi.fn(),
  },
}))

type EventHandler = (event: AgentEvent) => void
let eventHandler: EventHandler

const user: AgentMessage = { role: "user", content: "hi", timestamp: 1 }
const assistant: AgentMessage = {
  role: "assistant",
  content: [{ type: "text", text: "hello" }],
  provider: "p",
  model: "m",
  usage: { input: 0, output: 0, cacheRead: 0, totalTokens: 10 },
  stopReason: "stop",
  timestamp: 2,
}

describe("useAgentChat 压缩事件消息流", () => {
  beforeEach(() => {
    vi.mocked(agentApi.onEvent).mockImplementation((handler) => {
      eventHandler = handler
      return () => {}
    })
    vi.mocked(agentApi.undoCompaction).mockReset()
  })

  it("compaction_start 追加 loading 占位，compaction_summary 替换为真实摘要", async () => {
    const { result } = renderHook(() => useAgentChat())
    await act(async () => {})

    act(() => {
      eventHandler({ type: "message_start", message: user })
      eventHandler({ type: "message_start", message: assistant })
    })
    expect(result.current.messages).toHaveLength(2)

    act(() => {
      eventHandler({ type: "compaction_start" })
    })
    expect(result.current.messages).toHaveLength(3)
    expect(result.current.messages[2].role).toBe("compactionSummary")
    expect(result.current.messages[2].isCompacting).toBe(true)
    expect(result.current.isCompacting).toBe(true)

    act(() => {
      eventHandler({
        type: "compaction_summary",
        message: {
          role: "compactionSummary",
          summary: "摘要内容",
          tokensBefore: 100,
          timestamp: 3,
          manual: true,
        },
      })
    })
    expect(result.current.messages).toHaveLength(3)
    const summary = result.current.messages[2]
    expect(summary.role).toBe("compactionSummary")
    expect(summary.isCompacting).toBeUndefined()
    expect(summary.blocks).toEqual([{ kind: "text", text: "摘要内容" }])
    expect(result.current.isCompacting).toBe(false)
  })

  it("compaction_start 后 compaction_failed 移除占位且不残留", async () => {
    const { result } = renderHook(() => useAgentChat())
    await act(async () => {})

    act(() => {
      eventHandler({ type: "message_start", message: user })
      eventHandler({ type: "message_start", message: assistant })
      eventHandler({ type: "compaction_start" })
    })
    expect(result.current.messages).toHaveLength(3)

    act(() => {
      eventHandler({ type: "compaction_failed" })
    })
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages.every((m) => !m.isCompacting)).toBe(true)
    expect(result.current.isCompacting).toBe(false)
  })

  it("末条为手动压缩摘要时 /undo 撤销压缩并移除摘要", async () => {
    vi.mocked(agentApi.undoCompaction).mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useAgentChat())
    await act(async () => {})

    act(() => {
      eventHandler({ type: "message_start", message: user })
      eventHandler({ type: "message_start", message: assistant })
      eventHandler({
        type: "compaction_summary",
        message: {
          role: "compactionSummary",
          summary: "手动摘要",
          tokensBefore: 100,
          timestamp: 3,
          manual: true,
        },
      })
    })
    expect(result.current.messages).toHaveLength(3)

    // 输入框残留 /undo：撤销压缩后应清空。
    act(() => result.current.setInputText("/undo"))
    expect(result.current.inputText).toBe("/undo")

    act(() => result.current.undoLastTurn())
    await act(async () => {})

    expect(agentApi.undoCompaction).toHaveBeenCalledTimes(1)
    expect(agentApi.restore).toHaveBeenCalledTimes(1)
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages.some((m) => m.role === "compactionSummary")).toBe(false)
    expect(result.current.inputText).toBe("")
  })

  it("撤销普通轮时回显该轮用户消息到输入框（QA 回显不受影响）", async () => {
    const { result } = renderHook(() => useAgentChat())
    await act(async () => {})

    act(() => {
      eventHandler({ type: "message_start", message: user })
      eventHandler({ type: "message_start", message: assistant })
    })
    act(() => result.current.setInputText("/undo"))

    act(() => result.current.undoLastTurn())
    await act(async () => {})

    // 撤销 QA 轮：回显用户消息原文，而非清空。
    expect(result.current.inputText).toBe("hi")
    expect(result.current.messages).toHaveLength(0)
  })

  it("末条为自动压缩摘要时 /undo 不做任何事（自动压缩不可撤销）", async () => {
    const { result } = renderHook(() => useAgentChat())
    await act(async () => {})

    act(() => {
      eventHandler({ type: "message_start", message: user })
      eventHandler({ type: "message_start", message: assistant })
      eventHandler({
        type: "compaction_summary",
        message: {
          role: "compactionSummary",
          summary: "自动摘要",
          tokensBefore: 100,
          timestamp: 3,
          manual: false,
        },
      })
    })
    expect(result.current.messages).toHaveLength(3)

    act(() => result.current.undoLastTurn())
    await act(async () => {})

    expect(agentApi.undoCompaction).not.toHaveBeenCalled()
    // 自动摘要不可撤销：消息列表不变（既不撤摘要也不误撤其下轮）。
    expect(result.current.messages).toHaveLength(3)
    expect(result.current.messages[2]?.role).toBe("compactionSummary")
    expect(result.current.messages[2]?.isManual).toBe(false)
  })
})
