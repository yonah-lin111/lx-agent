import type { AgentMessage, AssistantMessage, StopReason, Usage } from "@shared/contracts/agent"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { Agent } from "@/agent/core/agent"
import type { AssistantMessageEventStream } from "@/agent/core/event-stream"
import { createAssistantMessageEventStream } from "@/agent/core/event-stream"
import type {
  AgentEvent,
  AgentTool,
  AgentToolResult,
  Context,
  LlmMessage,
  Model,
  StreamFn,
} from "@/agent/core/types"

const EMPTY_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 }

const TEST_MODEL: Model = { provider: "test", id: "test-model" }

// 构造助手消息。
const assistant = (
  blocks: AssistantMessage["content"],
  stopReason: StopReason = "stop",
): AssistantMessage => ({
  role: "assistant",
  content: blocks,
  provider: TEST_MODEL.provider,
  model: TEST_MODEL.id,
  usage: EMPTY_USAGE,
  stopReason,
  timestamp: 0,
})

// 构造工具调用块。
const toolCallBlock = (id: string, name: string, args: Record<string, unknown>) => ({
  type: "toolCall" as const,
  id,
  name,
  arguments: args,
})

// 按队列逐次返回响应的 mock streamFn。
const createMockStreamFn = (responses: AssistantMessage[]): StreamFn => {
  const queue = [...responses]
  const streamFn: StreamFn = async (
    _model: Model,
    _context: Context,
  ): Promise<AssistantMessageEventStream> => {
    const stream = createAssistantMessageEventStream()
    const response = queue.shift()
    if (!response) {
      throw new Error("No more mock responses")
    }
    stream.push({ type: "start", partial: response })
    stream.push({ type: "done", reason: response.stopReason, message: response })
    stream.end()
    return stream
  }
  return streamFn
}

// 运行一次 prompt 并收集事件。
const runPrompt = async (agent: Agent, prompt: string): Promise<AgentEvent[]> => {
  const events: AgentEvent[] = []
  agent.subscribe((event) => {
    events.push(event)
  })
  await agent.prompt(prompt)
  return events
}

// 断言每条 assistant toolCall 都有对应 toolResult（MissingToolResultsError 的触发条件）。
const assertNoDanglingToolCalls = (messages: AgentMessage[]): void => {
  const toolResultIds = new Set(
    messages
      .filter(
        (message): message is Extract<AgentMessage, { role: "toolResult" }> =>
          message.role === "toolResult",
      )
      .map((message) => message.toolCallId),
  )
  for (const message of messages) {
    if (message.role !== "assistant") continue
    for (const block of message.content) {
      if (block.type !== "toolCall") continue
      expect(toolResultIds.has(block.id), `悬空 toolCall: ${block.id}`).toBe(true)
    }
  }
}

// 构造 echo 工具：返回参数透传。
const createEchoTool = (): AgentTool<z.ZodType<{ text: string }>> => ({
  name: "echo",
  label: "回显",
  description: "回显输入文本",
  inputSchema: z.object({ text: z.string() }),
  execute: async (_toolCallId, params): Promise<AgentToolResult> => ({
    content: [{ type: "text", text: `echo:${params.text}` }],
  }),
})

describe("Agent 工具循环", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("无工具调用时单轮完成", async () => {
    const agent = new Agent({
      streamFn: createMockStreamFn([assistant([{ type: "text", text: "你好" }], "stop")]),
      initialState: { model: TEST_MODEL, tools: [] },
    })

    const events = await runPrompt(agent, "hi")

    expect(events.some((event) => event.type === "agent_start")).toBe(true)
    const endEvent = events.find((event) => event.type === "agent_end")
    expect(endEvent?.type).toBe("agent_end")
    if (endEvent?.type !== "agent_end") return
    expect(endEvent.messages.map((message) => message.role)).toEqual(["user", "assistant"])
    const assistantMessage = endEvent.messages[1]
    expect(assistantMessage?.role).toBe("assistant")
    if (assistantMessage?.role !== "assistant") return
    expect(assistantMessage.content[0]).toEqual({ type: "text", text: "你好" })
  })

  it("工具调用执行并回灌结果后继续循环", async () => {
    const executeMock = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "echo:hi" }] })
    const echoTool: AgentTool<z.ZodType<{ text: string }>> = {
      name: "echo",
      label: "回显",
      description: "回显",
      inputSchema: z.object({ text: z.string() }),
      execute: executeMock,
    }

    const agent = new Agent({
      streamFn: createMockStreamFn([
        assistant([toolCallBlock("call-1", "echo", { text: "hi" })], "toolUse"),
        assistant([{ type: "text", text: "完成" }], "stop"),
      ]),
      initialState: { model: TEST_MODEL, tools: [echoTool] },
    })

    const events = await runPrompt(agent, "hi")

    // 工具执行：start → end，且参数已校验。
    const toolStart = events.find((event) => event.type === "tool_execution_start")
    expect(toolStart?.type).toBe("tool_execution_start")
    if (toolStart?.type !== "tool_execution_start") return
    expect(toolStart.toolName).toBe("echo")
    expect(toolStart.args).toEqual({ text: "hi" })

    const toolEnd = events.find((event) => event.type === "tool_execution_end")
    expect(toolEnd?.type).toBe("tool_execution_end")
    if (toolEnd?.type !== "tool_execution_end") return
    expect(toolEnd.isError).toBe(false)
    expect(executeMock).toHaveBeenCalledTimes(1)

    // 工具结果消息出现在会话中。
    const toolResultMessage = events.find(
      (event): event is Extract<AgentEvent, { type: "message_start" }> =>
        event.type === "message_start" && event.message.role === "toolResult",
    )
    expect(toolResultMessage?.message.role).toBe("toolResult")

    // 第二轮的流式回复也发出。
    const assistantEvents = events.filter(
      (event): event is Extract<AgentEvent, { type: "message_end" }> =>
        event.type === "message_end" && event.message.role === "assistant",
    )
    expect(assistantEvents.length).toBe(2)
  })

  it("未知工具返回错误结果且不中断循环", async () => {
    const agent = new Agent({
      streamFn: createMockStreamFn([
        assistant([toolCallBlock("call-1", "unknown-tool", {})], "toolUse"),
        assistant([{ type: "text", text: "继续" }], "stop"),
      ]),
      initialState: { model: TEST_MODEL, tools: [] },
    })

    const events = await runPrompt(agent, "hi")

    const toolEnd = events.find((event) => event.type === "tool_execution_end")
    expect(toolEnd?.type).toBe("tool_execution_end")
    if (toolEnd?.type !== "tool_execution_end") return
    expect(toolEnd.isError).toBe(true)
    expect(toolEnd.toolName).toBe("unknown-tool")

    const errorResult = events.find(
      (event): event is Extract<AgentEvent, { type: "message_start" }> =>
        event.type === "message_start" && event.message.role === "toolResult",
    )
    expect(errorResult?.message.role).toBe("toolResult")
    if (errorResult?.message.role !== "toolResult") return
    expect(errorResult.message.isError).toBe(true)
    expect(errorResult.message.content[0]).toEqual(
      expect.objectContaining({ type: "text", text: expect.stringContaining("not found") }),
    )
  })

  it("工具抛错转换为错误结果", async () => {
    const echoTool: AgentTool<z.ZodType<{ text: string }>> = {
      name: "echo",
      label: "回显",
      description: "回显",
      inputSchema: z.object({ text: z.string() }),
      execute: async () => {
        throw new Error("boom")
      },
    }

    const agent = new Agent({
      streamFn: createMockStreamFn([
        assistant([toolCallBlock("call-1", "echo", { text: "hi" })], "toolUse"),
        assistant([{ type: "text", text: "继续" }], "stop"),
      ]),
      initialState: { model: TEST_MODEL, tools: [echoTool] },
    })

    const events = await runPrompt(agent, "hi")

    const toolEnd = events.find((event) => event.type === "tool_execution_end")
    expect(toolEnd?.type).toBe("tool_execution_end")
    if (toolEnd?.type !== "tool_execution_end") return
    expect(toolEnd.isError).toBe(true)
    expect((toolEnd.result as AgentToolResult).content[0]).toEqual(
      expect.objectContaining({ type: "text", text: "boom" }),
    )
  })

  it("参数校验失败转换为错误结果且不执行工具", async () => {
    const executeMock = vi.fn()
    const echoTool: AgentTool<z.ZodType<{ text: string }>> = {
      name: "echo",
      label: "回显",
      description: "回显",
      inputSchema: z.object({ text: z.string() }),
      execute: executeMock,
    }

    const agent = new Agent({
      streamFn: createMockStreamFn([
        assistant([toolCallBlock("call-1", "echo", { wrong: true })], "toolUse"),
        assistant([{ type: "text", text: "继续" }], "stop"),
      ]),
      initialState: { model: TEST_MODEL, tools: [echoTool] },
    })

    const events = await runPrompt(agent, "hi")

    const toolEnd = events.find((event) => event.type === "tool_execution_end")
    expect(toolEnd?.type).toBe("tool_execution_end")
    if (toolEnd?.type !== "tool_execution_end") return
    expect(toolEnd.isError).toBe(true)
    expect(executeMock).not.toHaveBeenCalled()
  })

  it("abort 中止当前 run 并以 aborted 结束", async () => {
    // 永不完结但感知 abort signal 的 streamFn（模拟挂起请求被取消）。
    const hangingStreamFn: StreamFn = async (_model, _context, options) => {
      const stream = createAssistantMessageEventStream()
      stream.push({
        type: "start",
        partial: assistant([], "pending"),
      })
      options?.signal?.addEventListener("abort", () => {
        const abortedMessage = assistant([], "aborted")
        stream.push({ type: "error", reason: "aborted", error: abortedMessage })
        stream.end()
      })
      return stream
    }

    const agent = new Agent({
      streamFn: hangingStreamFn,
      initialState: { model: TEST_MODEL, tools: [] },
    })

    const events: AgentEvent[] = []
    agent.subscribe((event) => {
      events.push(event)
    })

    const promptPromise = agent.prompt("hi")
    // 挂起时中止。
    await new Promise((resolve) => setTimeout(resolve, 10))
    agent.abort()
    await promptPromise

    const endEvent = events.find((event) => event.type === "agent_end")
    expect(endEvent?.type).toBe("agent_end")
    if (endEvent?.type !== "agent_end") return
    const lastMessage = endEvent.messages[endEvent.messages.length - 1]
    expect(lastMessage?.role).toBe("assistant")
    if (lastMessage?.role !== "assistant") return
    expect(lastMessage.stopReason).toBe("aborted")
  })

  it("Agent 正在运行时重复 prompt 被拒绝", async () => {
    const hangingStreamFn: StreamFn = async (_model, _context, options) => {
      const stream = createAssistantMessageEventStream()
      stream.push({ type: "start", partial: assistant([], "pending") })
      options?.signal?.addEventListener("abort", () => {
        stream.push({ type: "error", reason: "aborted", error: assistant([], "aborted") })
        stream.end()
      })
      return stream
    }

    const agent = new Agent({
      streamFn: hangingStreamFn,
      initialState: { model: TEST_MODEL, tools: [] },
    })

    const first = agent.prompt("hi")
    await expect(agent.prompt("again")).rejects.toThrow(/already processing/i)
    agent.abort()
    await first
  })

  it("echo 工具参数校验成功时按校验后的值执行", async () => {
    const agent = new Agent({
      streamFn: createMockStreamFn([
        assistant([toolCallBlock("call-1", "echo", { text: "world" })], "toolUse"),
        assistant([{ type: "text", text: "完成" }], "stop"),
      ]),
      initialState: { model: TEST_MODEL, tools: [createEchoTool()] },
    })

    const events = await runPrompt(agent, "hi")

    const toolResult = events.find(
      (event): event is Extract<AgentEvent, { type: "message_start" }> =>
        event.type === "message_start" && event.message.role === "toolResult",
    )
    expect(toolResult?.message.role).toBe("toolResult")
    if (toolResult?.message.role !== "toolResult") return
    expect(toolResult.message.content[0]).toEqual({ type: "text", text: "echo:world" })
    expect(toolResult.message.toolName).toBe("echo")
  })

  it("error 停止时为已创建的 toolCall 补错误结果，会话可继续", async () => {
    const agent = new Agent({
      streamFn: createMockStreamFn([
        assistant([toolCallBlock("call-1", "echo", { text: "hi" })], "error"),
        assistant([{ type: "text", text: "继续" }], "stop"),
      ]),
      initialState: { model: TEST_MODEL, tools: [createEchoTool()] },
    })

    const events = await runPrompt(agent, "第一轮")

    const toolEnd = events.find((event) => event.type === "tool_execution_end")
    expect(toolEnd?.type).toBe("tool_execution_end")
    if (toolEnd?.type !== "tool_execution_end") return
    expect(toolEnd.isError).toBe(true)
    expect(toolEnd.toolName).toBe("echo")

    const endEvent = events.find((event) => event.type === "agent_end")
    expect(endEvent?.type).toBe("agent_end")
    if (endEvent?.type !== "agent_end") return
    expect(endEvent.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "toolResult",
    ])
    assertNoDanglingToolCalls(endEvent.messages)

    // 第二轮请求的历史中不再有悬空 toolCall。
    await runPrompt(agent, "第二轮")
    assertNoDanglingToolCalls(agent.state.messages)
  })

  it("aborted 停止时为已创建的 toolCall 补错误结果", async () => {
    const agent = new Agent({
      streamFn: createMockStreamFn([
        assistant([toolCallBlock("call-1", "echo", { text: "hi" })], "aborted"),
      ]),
      initialState: { model: TEST_MODEL, tools: [createEchoTool()] },
    })

    const events = await runPrompt(agent, "hi")

    const resultMessage = events.find(
      (event): event is Extract<AgentEvent, { type: "message_start" }> =>
        event.type === "message_start" && event.message.role === "toolResult",
    )
    expect(resultMessage?.message.role).toBe("toolResult")
    if (resultMessage?.message.role !== "toolResult") return
    expect(resultMessage.message.isError).toBe(true)
    expect(resultMessage.message.content[0]).toEqual(
      expect.objectContaining({ type: "text", text: expect.stringContaining("was aborted") }),
    )

    const endEvent = events.find((event) => event.type === "agent_end")
    expect(endEvent?.type).toBe("agent_end")
    if (endEvent?.type !== "agent_end") return
    assertNoDanglingToolCalls(endEvent.messages)
  })

  it("工具批次中途中止时为未执行的 toolCall 补错误结果", async () => {
    let agentRef: Agent | undefined
    const abortingTool: AgentTool = {
      name: "abort-tool",
      label: "中止",
      description: "执行后中止当前 run",
      inputSchema: z.object({}),
      executionMode: "sequential",
      execute: async () => {
        agentRef?.abort()
        return { content: [{ type: "text", text: "已中止" }] }
      },
    }

    agentRef = new Agent({
      streamFn: createMockStreamFn([
        assistant(
          [toolCallBlock("c1", "abort-tool", {}), toolCallBlock("c2", "abort-tool", {})],
          "toolUse",
        ),
        assistant([{ type: "text", text: "继续" }], "stop"),
      ]),
      initialState: { model: TEST_MODEL, tools: [abortingTool] },
    })

    const events = await runPrompt(agentRef, "hi")

    const toolResultMessages = events.flatMap((event) => {
      if (event.type !== "message_start" || event.message.role !== "toolResult") return []
      return [event.message]
    })
    expect(toolResultMessages.map((message) => message.toolCallId).sort()).toEqual(["c1", "c2"])

    const endEvent = events.find((event) => event.type === "agent_end")
    expect(endEvent?.type).toBe("agent_end")
    if (endEvent?.type !== "agent_end") return
    assertNoDanglingToolCalls(endEvent.messages)
  })

  it("sequential 工具（如 question）执行完成后将 answers 回填到 assistant message", async () => {
    const questionTool: AgentTool<
      z.ZodType<{ questions: Array<{ question: string }> }>,
      { answers: Array<{ question: string; answer: string[] }> }
    > = {
      name: "question",
      label: "提问",
      description: "提问工具",
      inputSchema: z.object({ questions: z.array(z.object({ question: z.string() })) }),
      executionMode: "sequential",
      execute: async () => ({
        content: [{ type: "text", text: "已回答" }],
        details: { answers: [{ question: "q1", answer: ["TypeScript"] }] },
      }),
    }

    const agent = new Agent({
      streamFn: createMockStreamFn([
        assistant(
          [toolCallBlock("call-q", "question", { questions: [{ question: "q1" }] })],
          "toolUse",
        ),
        assistant([{ type: "text", text: "收到答案" }], "stop"),
      ]),
      initialState: { model: TEST_MODEL, tools: [questionTool] },
    })

    const events = await runPrompt(agent, "hi")
    const endEvent = events.find((event) => event.type === "agent_end")
    expect(endEvent?.type).toBe("agent_end")
    if (endEvent?.type !== "agent_end") return

    const assistantMsg = endEvent.messages.find(
      (m): m is AssistantMessage =>
        m.role === "assistant" &&
        m.content.some((c) => c.type === "toolCall" && c.name === "question"),
    )
    expect(assistantMsg).toBeDefined()
    const callBlock = assistantMsg?.content.find(
      (c): c is Extract<AssistantMessage["content"][number], { type: "toolCall" }> =>
        c.type === "toolCall" && c.name === "question",
    )
    expect(callBlock?.answers).toEqual([{ question: "q1", answer: ["TypeScript"] }])
  })
})

describe("Agent 失败路径不变量", () => {
  it("listener 抛错时失败路径仍为悬空 toolCall 补结果", async () => {
    const agent = new Agent({
      streamFn: createMockStreamFn([
        assistant([toolCallBlock("call-1", "echo", { text: "hi" })], "toolUse"),
      ]),
      initialState: { model: TEST_MODEL, tools: [createEchoTool()] },
    })
    // 模拟外部监听器（投影/持久化）在 assistant 消息落位后抛错。
    agent.subscribe((event) => {
      if (
        event.type === "message_end" &&
        event.message.role === "assistant" &&
        event.message.content.some((block) => block.type === "toolCall")
      ) {
        throw new Error("listener boom")
      }
    })

    await agent.prompt("hi")

    assertNoDanglingToolCalls(agent.state.messages)
  })

  it("abort 后残留 steer 不注入下一次 prompt", async () => {
    const seenContexts: LlmMessage[][] = []
    const streamFn: StreamFn = async (_model, context, options) => {
      const stream = createAssistantMessageEventStream()
      seenContexts.push(context.messages)
      if (seenContexts.length === 1) {
        stream.push({ type: "start", partial: assistant([], "pending") })
        options?.signal?.addEventListener("abort", () => {
          stream.push({ type: "error", reason: "aborted", error: assistant([], "aborted") })
          stream.end()
        })
        return stream
      }
      const final = assistant([{ type: "text", text: "第二轮回答" }], "stop")
      stream.push({ type: "start", partial: final })
      stream.push({ type: "done", reason: "stop", message: final })
      stream.end()
      return stream
    }

    const agent = new Agent({ streamFn, initialState: { model: TEST_MODEL, tools: [] } })
    const first = agent.prompt("第一轮")
    await new Promise((resolve) => setTimeout(resolve, 10))
    agent.steer({ role: "user", content: "stale steer", timestamp: Date.now() })
    agent.abort()
    await first

    expect(agent.hasQueuedMessages()).toBe(false)

    await agent.prompt("第二轮")
    const secondContext = seenContexts[1] ?? []
    const staleInjected = secondContext.some(
      (message) => message.role === "user" && message.content === "stale steer",
    )
    expect(staleInjected).toBe(false)
  })
})

describe("Agent 消息转换", () => {
  it("用户消息与助手消息进入会话上下文", async () => {
    const agent = new Agent({
      streamFn: createMockStreamFn([assistant([{ type: "text", text: "回复" }], "stop")]),
      initialState: { model: TEST_MODEL, tools: [] },
    })

    await runPrompt(agent, "问题")

    const messages = agent.state.messages
    expect(messages.map((message: AgentMessage) => message.role)).toEqual(["user", "assistant"])
  })

  it("reset 清空会话上下文", async () => {
    const agent = new Agent({
      streamFn: createMockStreamFn([assistant([{ type: "text", text: "回复" }], "stop")]),
      initialState: { model: TEST_MODEL, tools: [] },
    })

    await runPrompt(agent, "问题")
    agent.reset()
    expect(agent.state.messages).toEqual([])
  })
})
