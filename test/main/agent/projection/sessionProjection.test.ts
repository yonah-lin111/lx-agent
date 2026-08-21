import type {
  AgentEvent,
  AssistantMessage,
  CompactionSummaryMessage,
  JobSnapshot,
  UserMessage,
} from "@shared/contracts/agent"
import {
  createInitialSessionProjectionState,
  projectSessionEvent,
  projectSessionHistory,
  SessionProjectionStore,
} from "@shared/contracts/sessionProjection"
import { describe, expect, it, vi } from "vitest"

describe("SessionProjection (事件驱动增量投影状态机)", () => {
  it("初始化状态结构完备且默认值正确", () => {
    const state = createInitialSessionProjectionState({ sessionId: "test-session" })
    expect(state.sessionId).toBe("test-session")
    expect(state.messages).toEqual([])
    expect(state.todos).toEqual([])
    expect(state.isStreaming).toBe(false)
    expect(state.isCompacting).toBe(false)
    expect(state.activeJobs).toEqual({})
    expect(state.queuedCount).toBe(0)
  })

  it("纯函数状态转移：完整模拟一轮对话消息流生命周期", () => {
    let state = createInitialSessionProjectionState({ sessionId: "sess-1" })

    // 1. agent_start & turn_start
    state = projectSessionEvent(state, { type: "agent_start" })
    expect(state.isStreaming).toBe(true)

    // 2. user message
    const userMsg: UserMessage = {
      role: "user",
      content: "Hello",
      timestamp: 1000,
    }
    state = projectSessionEvent(state, { type: "message_start", message: userMsg })
    state = projectSessionEvent(state, { type: "message_end", message: userMsg })
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toEqual(userMsg)

    // 3. assistant message streaming
    const partialAssistant: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Hi" }],
      provider: "openai",
      model: "gpt-4",
      usage: { input: 1, output: 1, cacheRead: 0, totalTokens: 2 },
      stopReason: "pending",
      timestamp: 1001,
    }
    state = projectSessionEvent(state, { type: "message_start", message: partialAssistant })
    expect(state.messages).toHaveLength(2)

    const updatedAssistant: AssistantMessage = {
      ...partialAssistant,
      content: [{ type: "text", text: "Hi there!" }],
    }
    state = projectSessionEvent(state, {
      type: "message_update",
      message: updatedAssistant,
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: " there!",
        partial: updatedAssistant,
      },
    })
    expect(state.messages).toHaveLength(2)
    expect(state.messages[1]).toEqual(updatedAssistant)

    const finalAssistant: AssistantMessage = {
      ...updatedAssistant,
      stopReason: "stop",
    }
    state = projectSessionEvent(state, { type: "message_end", message: finalAssistant })
    expect(state.messages[1]).toEqual(finalAssistant)

    // 4. todo_updated
    state = projectSessionEvent(state, {
      type: "todo_updated",
      todos: [{ content: "Task 1", status: "in_progress" }],
    })
    expect(state.todos).toHaveLength(1)
    expect(state.todos[0]!.content).toBe("Task 1")

    // 5. context_usage & queue_changed
    state = projectSessionEvent(state, {
      type: "context_usage",
      tokens: 1500,
      contextWindow: 128000,
    })
    expect(state.contextUsage).toEqual({ tokens: 1500, contextWindow: 128000 })

    state = projectSessionEvent(state, {
      type: "queue_changed",
      length: 2,
      messages: ["msg 1", "msg 2"],
    })
    expect(state.queuedCount).toBe(2)
    expect(state.queuedMessages).toEqual(["msg 1", "msg 2"])

    // 6. agent_end
    state = projectSessionEvent(state, { type: "agent_end", messages: state.messages })
    expect(state.isStreaming).toBe(false)
  })

  it("上下文压缩事件驱动：compaction_start / failed / summary", () => {
    let state = createInitialSessionProjectionState()

    // 启动压缩
    state = projectSessionEvent(state, {
      type: "compaction_start",
      compactionId: "c-1",
      manual: true,
    })
    expect(state.isCompacting).toBe(true)
    expect(state.isCompactingManual).toBe(true)

    // 失败重置
    state = projectSessionEvent(state, {
      type: "compaction_failed",
      compactionId: "c-1",
      manual: true,
    })
    expect(state.isCompacting).toBe(false)
    expect(state.isCompactingManual).toBe(false)

    // 再次启动并成功生成摘要
    state = projectSessionEvent(state, {
      type: "compaction_start",
      compactionId: "c-2",
      manual: false,
    })
    const summaryMsg: CompactionSummaryMessage = {
      role: "compactionSummary",
      summary: "Summary text",
      tokensBefore: 50000,
      timestamp: 2000,
      manual: false,
    }
    state = projectSessionEvent(state, {
      type: "compaction_summary",
      compactionId: "c-2",
      message: summaryMsg,
    })
    expect(state.isCompacting).toBe(false)
    expect(state.messages).toContain(summaryMsg)
  })

  it("后台任务与权限请求状态投影", () => {
    let state = createInitialSessionProjectionState()

    const job: JobSnapshot = {
      id: "bash-1",
      kind: "bash",
      label: "npm test",
      status: "running",
      startedAt: 1000,
      sessionId: "s-1",
    }
    state = projectSessionEvent(state, { type: "job_started", job })
    expect(state.activeJobs["bash-1"]).toEqual(job)

    state = projectSessionEvent(state, {
      type: "permission_request",
      request: {
        requestId: "req-1",
        toolName: "bash",
        args: { command: "ls" },
        summary: "Execute command",
        mode: "default",
        sessionId: "s-1",
      },
    })
    expect(state.pendingPermission?.requestId).toBe("req-1")

    // turn_end 清理 pending 态
    state = projectSessionEvent(state, {
      type: "turn_end",
      message: {
        role: "assistant",
        content: [],
        provider: "p",
        model: "m",
        usage: { input: 0, output: 0, cacheRead: 0, totalTokens: 0 },
        stopReason: "stop",
        timestamp: 1000,
      },
      toolResults: [],
    })
    expect(state.pendingPermission).toBeNull()
  })

  it("批量折叠 projectSessionHistory 与逐条投影严格等价", () => {
    const userMsg: UserMessage = { role: "user", content: "Test", timestamp: 1 }
    const assistantMsg: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Answer" }],
      provider: "p",
      model: "m",
      usage: { input: 1, output: 1, cacheRead: 0, totalTokens: 2 },
      stopReason: "stop",
      timestamp: 2,
    }

    const events: AgentEvent[] = [
      { type: "agent_start" },
      { type: "message_start", message: userMsg },
      { type: "message_end", message: userMsg },
      { type: "message_start", message: assistantMsg },
      { type: "message_end", message: assistantMsg },
      { type: "todo_updated", todos: [{ content: "Item", status: "completed" }] },
      { type: "agent_end", messages: [userMsg, assistantMsg] },
    ]

    const initial = createInitialSessionProjectionState({ sessionId: "sess-fold" })
    const folded = projectSessionHistory(initial, events)

    const store = new SessionProjectionStore({ sessionId: "sess-fold" })
    for (const evt of events) {
      store.apply(evt)
    }

    expect(folded).toEqual(store.getState())
    expect(folded.isStreaming).toBe(false)
    expect(folded.messages).toHaveLength(2)
    expect(folded.todos).toHaveLength(1)
  })

  it("SessionProjectionStore 订阅与取消订阅通知机制", () => {
    const store = new SessionProjectionStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.apply({ type: "agent_start" })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getState().isStreaming).toBe(true)

    unsubscribe()
    store.apply({ type: "turn_start" })
    // 取消订阅后不再触发 listener
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
