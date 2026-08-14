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
  Model,
  StreamFn,
} from "@/agent/core/types"

const EMPTY_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, totalTokens: 0 }

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
