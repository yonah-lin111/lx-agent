// @vitest-environment jsdom
import type { AgentEvent, AgentMessage, AssistantMessage, TodoList } from "@shared/contracts/agent"
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { agentApi } from "@/features/agent/api/agentApi"
import { useAgentChat } from "@/features/agent/hooks/useAgentChat"

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    onEvent: vi.fn(),
    abort: vi.fn(),
    send: vi.fn(),
    continue: vi.fn(),
    compact: vi.fn(),
    switchModel: vi.fn(),
    setCollaborationMode: vi.fn(),
    getContextUsage: vi.fn(),
    restore: vi.fn(),
    restoreSession: vi.fn(),
    deleteMessageTurn: vi.fn(),
    undoCompaction: vi.fn(),
    listSessions: vi.fn().mockResolvedValue([]),
  },
}))

type EventHandler = (event: AgentEvent) => void
let eventHandler: EventHandler

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 10 }

const userMessage = (text: string, timestamp: number): AgentMessage => ({
  role: "user",
  content: text,
  timestamp,
})

const assistantMessage = (
  text: string,
  timestamp: number,
  stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage => ({
  role: "assistant",
  content: [{ type: "text", text }],
  provider: "p",
  model: "m",
  usage,
  stopReason,
  timestamp,
})

const toolCallAssistant = (toolCallId: string, name = "read"): AssistantMessage => ({
  role: "assistant",
  content: [{ type: "toolCall", id: toolCallId, name, arguments: {} }],
  provider: "p",
  model: "m",
  usage,
  stopReason: "toolUse",
  timestamp: 2,
})

const renderAgentChat = async (tabId?: string) => {
  const view = renderHook(() => useAgentChat(undefined, tabId))
  await act(async () => {})
  return view
}

describe("useAgentChat 事件路由剩余分支", () => {
  beforeEach(() => {
    vi.mocked(agentApi.onEvent).mockImplementation((handler) => {
      eventHandler = handler
      return () => {}
    })
    vi.mocked(agentApi.restore).mockReset()
    vi.mocked(agentApi.getContextUsage).mockReset()
    vi.mocked(agentApi.compact).mockReset()
  })

  it("todo_updated 整表替换任务清单，空数组清空指示", async () => {
    const { result } = await renderAgentChat()
    const todos: TodoList = [
      { content: "step 1", status: "in_progress" },
      { content: "step 2", status: "pending" },
    ]

    act(() => {
      eventHandler({ type: "todo_updated", todos })
    })
    expect(result.current.todos).toEqual(todos)

    act(() => {
      eventHandler({ type: "todo_updated", todos: [] })
    })
    expect(result.current.todos).toEqual([])
  })

  it("context_usage 更新上下文容量快照", async () => {
    const { result } = await renderAgentChat()

    act(() => {
      eventHandler({ type: "context_usage", tokens: 1200, contextWindow: 8000 })
    })
    expect(result.current.contextUsage).toEqual({ tokens: 1200, contextWindow: 8000 })
  })

  it("queue_changed 维护排队计数与原文，并在出队后的下一条 user 消息标记 drain", async () => {
    const { result } = await renderAgentChat()

    act(() => {
      eventHandler({ type: "agent_start" })
      eventHandler({ type: "queue_changed", length: 2, messages: ["第一条", "第二条"] })
    })
    expect(result.current.queuedCount).toBe(2)
    expect(result.current.queuedMessages).toEqual(["第一条", "第二条"])

    act(() => {
      eventHandler({ type: "queue_changed", length: 1, messages: ["第二条"] })
      eventHandler({ type: "message_start", message: userMessage("第二条", 1) })
    })
    expect(result.current.queuedCount).toBe(1)
    expect(result.current.messages.at(-1)?.isQueuedDrain).toBe(true)

    act(() => {
      eventHandler({ type: "queue_changed", length: 1, messages: ["第二条"] })
      eventHandler({ type: "message_start", message: userMessage("常规发送", 2) })
    })
    expect(result.current.messages.at(-1)?.isQueuedDrain).toBeUndefined()
  })

  it("collaboration_mode_changed 同步当前协作模式", async () => {
    const { result } = await renderAgentChat()
    expect(result.current.collaborationMode).toBe("build")

    act(() => {
      eventHandler({ type: "collaboration_mode_changed", mode: "plan" })
    })
    expect(result.current.collaborationMode).toBe("plan")

    act(() => {
      eventHandler({ type: "collaboration_mode_changed", mode: "design" })
    })
    expect(result.current.collaborationMode).toBe("design")
  })

  it("collaboration_mode_changed 携带 message 时落位 FlowList 条目，连续切换原地合并", async () => {
    const { result } = await renderAgentChat()

    act(() => {
      eventHandler({
        type: "collaboration_mode_changed",
        mode: "plan",
        message: { role: "modeSwitch", mode: "plan", timestamp: 100 },
      })
    })
    expect(result.current.messages.filter((m) => m.role === "modeSwitch")).toHaveLength(1)

    act(() => {
      eventHandler({
        type: "collaboration_mode_changed",
        mode: "review",
        message: { role: "modeSwitch", mode: "review", timestamp: 200 },
      })
    })
    const items = result.current.messages.filter((m) => m.role === "modeSwitch")
    expect(items).toHaveLength(1)
    expect(items[0].collaborationMode).toBe("review")
  })

  it("question_request 把提问请求回填到对应 question 工具块", async () => {
    const { result } = await renderAgentChat()

    act(() => {
      eventHandler({ type: "message_start", message: toolCallAssistant("tool-1", "question") })
      eventHandler({
        type: "question_request",
        request: {
          requestId: "req-1",
          toolCallId: "tool-1",
          questions: [],
          sessionId: null,
        },
      })
    })

    const block = result.current.messages[0].blocks[0]
    expect(block.kind).toBe("toolCall")
    expect(block.kind === "toolCall" ? block.question?.requestId : undefined).toBe("req-1")
  })

  it("tool_execution_start/end 流转工具状态并回填答案与子代理快照", async () => {
    const { result } = await renderAgentChat()

    act(() => {
      eventHandler({ type: "message_start", message: toolCallAssistant("tool-2", "task") })
    })
    const initialBlock = result.current.messages[0].blocks[0]
    expect(initialBlock.kind === "toolCall" ? initialBlock.status : undefined).toBe("running")

    act(() => {
      eventHandler({
        type: "tool_execution_start",
        toolCallId: "tool-2",
        toolName: "task",
        args: {},
      })
    })
    const runningBlock = result.current.messages[0].blocks[0]
    expect(runningBlock.kind === "toolCall" ? runningBlock.status : undefined).toBe("running")

    act(() => {
      eventHandler({
        type: "tool_execution_end",
        toolCallId: "tool-2",
        toolName: "task",
        isError: false,
        result: {
          details: {
            answers: [{ question: "选择分支", answer: ["main"] }],
            subagent: { id: "sub-1", status: "done" },
          },
        },
      } as unknown as AgentEvent)
    })

    const doneBlock = result.current.messages[0].blocks[0]
    expect(doneBlock.kind === "toolCall" ? doneBlock.status : undefined).toBe("done")
    expect(doneBlock.kind === "toolCall" ? doneBlock.answers : undefined).toEqual([
      { question: "选择分支", answer: ["main"] },
    ])
    expect(doneBlock.kind === "toolCall" ? doneBlock.subagent : undefined).toEqual({
      id: "sub-1",
      status: "done",
    })
  })

  it("tool_execution_end 带错误时标记 error 状态", async () => {
    const { result } = await renderAgentChat()

    act(() => {
      eventHandler({ type: "message_start", message: toolCallAssistant("tool-3") })
      eventHandler({
        type: "tool_execution_end",
        toolCallId: "tool-3",
        toolName: "read",
        isError: true,
        result: {},
      } as unknown as AgentEvent)
    })

    const block = result.current.messages[0].blocks[0]
    expect(block.kind === "toolCall" ? block.status : undefined).toBe("error")
  })
})

describe("useAgentChat 轮次生命周期", () => {
  beforeEach(() => {
    vi.mocked(agentApi.onEvent).mockImplementation((handler) => {
      eventHandler = handler
      return () => {}
    })
    vi.mocked(agentApi.restore).mockReset()
    vi.mocked(agentApi.compact).mockReset()
    vi.mocked(agentApi.deleteMessageTurn)
      .mockReset()
      .mockResolvedValue({ ok: true } as never)
    vi.mocked(agentApi.getContextUsage).mockReset()
  })

  it("createNewChat 清空本地状态并重置 main 侧上下文", async () => {
    const { result } = await renderAgentChat("tab-1")

    act(() => {
      eventHandler({ type: "message_start", message: userMessage("第一轮", 1) })
      eventHandler({ type: "todo_updated", todos: [{ content: "step", status: "pending" }] })
    })
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.todos).toHaveLength(1)

    act(() => {
      result.current.createNewChat()
    })

    expect(result.current.messages).toEqual([])
    expect(result.current.todos).toEqual([])
    expect(result.current.currentSessionId).toBeNull()
    expect(agentApi.restore).toHaveBeenCalledWith([], undefined, "tab-1")
  })

  it("deleteTurn 移除指定 AI 消息所在轮次并插入撤销摘要", async () => {
    const { result } = await renderAgentChat()

    act(() => {
      eventHandler({ type: "message_start", message: userMessage("第一轮问题", 1) })
      eventHandler({ type: "message_start", message: assistantMessage("第一轮回答", 2) })
      eventHandler({ type: "message_start", message: userMessage("第二轮问题", 3) })
      eventHandler({ type: "message_start", message: assistantMessage("第二轮回答", 4) })
    })
    const target = result.current.messages[3]
    expect(target.role).toBe("assistant")

    act(() => {
      result.current.deleteTurn(target.id)
    })

    expect(result.current.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "undoSummary",
    ])
    expect(
      result.current.messages.some((message) =>
        message.blocks.some((block) => block.kind === "text" && block.text === "第二轮回答"),
      ),
    ).toBe(false)
  })

  it("compactChat 流式生成中阻塞，非流式时调用 main 压缩", async () => {
    const { result } = await renderAgentChat()
    vi.mocked(agentApi.compact).mockResolvedValue({ ok: true } as never)

    act(() => {
      eventHandler({ type: "agent_start" })
    })
    act(() => {
      result.current.compactChat()
    })
    expect(agentApi.compact).not.toHaveBeenCalled()

    act(() => {
      eventHandler({ type: "agent_end", messages: [] })
    })
    await act(async () => {
      result.current.compactChat()
    })
    expect(agentApi.compact).toHaveBeenCalledTimes(1)
  })

  it("editMessage 仅更新指定消息的文本块内容", async () => {
    const { result } = await renderAgentChat()

    act(() => {
      eventHandler({ type: "message_start", message: userMessage("原始内容", 1) })
      eventHandler({ type: "message_start", message: assistantMessage("回答", 2) })
    })
    const [userItem, assistantItem] = result.current.messages

    act(() => {
      result.current.editMessage(userItem.id, "修改后的内容")
    })

    expect(result.current.messages[0].blocks[0]).toMatchObject({
      kind: "text",
      text: "修改后的内容",
    })
    expect(result.current.messages[1].blocks[0]).toMatchObject({ kind: "text", text: "回答" })
    expect(result.current.messages[1].id).toBe(assistantItem.id)
  })

  it("isOnlyOneTurnLeft 依据用户消息轮数判定", async () => {
    const { result } = await renderAgentChat()
    expect(result.current.isOnlyOneTurnLeft()).toBe(false)

    act(() => {
      eventHandler({ type: "message_start", message: userMessage("唯一一轮", 1) })
    })
    expect(result.current.isOnlyOneTurnLeft()).toBe(true)

    act(() => {
      eventHandler({ type: "message_start", message: userMessage("第二轮", 2) })
    })
    expect(result.current.isOnlyOneTurnLeft()).toBe(false)
  })

  it("refreshContextUsage 无历史容量时保持不显示，已有容量时刷新", async () => {
    const { result } = await renderAgentChat()
    vi.mocked(agentApi.getContextUsage).mockResolvedValue({
      tokens: 500,
      contextWindow: 4000,
    } as never)

    await act(async () => {
      result.current.refreshContextUsage()
    })
    expect(result.current.contextUsage).toBeNull()

    act(() => {
      eventHandler({ type: "context_usage", tokens: 100, contextWindow: 8000 })
    })
    await act(async () => {
      result.current.refreshContextUsage()
    })
    expect(result.current.contextUsage).toEqual({ tokens: 500, contextWindow: 4000 })
  })
})
