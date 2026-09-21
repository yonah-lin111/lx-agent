import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { Agent } from "@/agent/core/agent"
import type { AgentTool, LlmMessage, Model } from "@/agent/core/types"
import { createAiSdkStreamFn } from "@/agent/stream/aiSdkStreamFn"
import { CAVEMAN_PROMPTS } from "@/agent/tokenSaver/prompts"

// Mock modelFactory
vi.mock("@/agent/stream/modelFactory", () => ({
  resolveLanguageModel: vi.fn().mockReturnValue({}),
}))

// Mock settingsService：可控 provider 配置（opencode Go 请求头注入用例）与 Token Saver 配置。
const settingsState = vi.hoisted(() => ({
  settings: {
    providers: {} as Record<string, unknown>,
    streamIdleTimeoutMs: undefined as number | undefined,
  },
  tokenSaver: {
    rtkEnabled: false,
    cavemanEnabled: false,
    cavemanLevel: "full" as const,
    ponytailEnabled: false,
    ponytailLevel: "full" as const,
  },
}))
vi.mock("@/services/settingsService", () => ({
  getModelProviderSettings: () => settingsState.settings,
  getTokenSaverSettings: () => settingsState.tokenSaver,
}))

// Mock ai streamText
const mockStreamText = vi.fn()
vi.mock("ai", () => ({
  stepCountIs: vi.fn().mockReturnValue(() => false),
  streamText: (options: unknown) => mockStreamText(options),
  tool: (config: unknown) => config,
}))

const TEST_MODEL: Model = { provider: "test-provider", id: "test-model" }

// 构造可供 RTK 压缩的长 diff 工具结果。
const makeLargeDiff = (): string => {
  const lines = ["diff --git a/foo.js b/foo.js", "@@ -1,3 +1,200 @@"]
  for (let i = 0; i < 200; i++) lines.push(`+added line ${i} ${"x".repeat(20)}`)
  return lines.join("\n")
}

const makeLargeDiffToolResult = (): LlmMessage => ({
  role: "toolResult",
  toolCallId: "call_1",
  toolName: "bash",
  content: [{ type: "text", text: makeLargeDiff() }],
  isError: false,
})

describe("createAiSdkStreamFn 与流式看门狗集成", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    settingsState.settings = { providers: {}, streamIdleTimeoutMs: undefined }
    settingsState.tokenSaver = {
      rtkEnabled: false,
      cavemanEnabled: false,
      cavemanLevel: "full",
      ponytailEnabled: false,
      ponytailLevel: "full",
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("正常流式输出生成助手消息并在 finish 时完成", async () => {
    async function* createMockStream() {
      yield { type: "text-start" as const }
      yield { type: "text-delta" as const, text: "你好，" }
      yield { type: "text-delta" as const, text: "世界！" }
      yield {
        type: "finish" as const,
        finishReason: "stop",
        totalUsage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        },
      }
    }

    mockStreamText.mockReturnValue({
      fullStream: createMockStream(),
    })

    const streamFn = createAiSdkStreamFn({ idleTimeoutMs: 5000 })
    const stream = await streamFn(TEST_MODEL, { systemPrompt: "", messages: [] }, {})

    const events: Array<unknown> = []
    for await (const event of stream) {
      events.push(event)
    }

    const finalResult = await stream.result()
    expect(finalResult.stopReason).toBe("stop")
    expect(finalResult.content).toEqual([
      { type: "text", text: "你好，世界！", durationMs: expect.any(Number) },
    ])
    expect(finalResult.usage).toEqual({
      input: 10,
      output: 20,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 30,
    })
  })

  it("当底层流假死未产生新 chunk 时，看门狗超时并中断流", async () => {
    let capturedAbortSignal: AbortSignal | undefined

    async function* createHangingStream() {
      yield { type: "text-start" as const }
      yield { type: "text-delta" as const, text: "正在思考..." }
      // 模拟静默挂起：等待 abort 信号
      await new Promise<void>((_, reject) => {
        capturedAbortSignal?.addEventListener("abort", () => {
          reject(new Error("Stream idle timeout after 1000ms"))
        })
      })
    }

    mockStreamText.mockImplementation((opts: { abortSignal?: AbortSignal }) => {
      capturedAbortSignal = opts.abortSignal
      return {
        fullStream: createHangingStream(),
      }
    })

    const streamFn = createAiSdkStreamFn({ idleTimeoutMs: 1000 })
    const stream = await streamFn(TEST_MODEL, { systemPrompt: "", messages: [] }, {})

    const streamPromise = (async () => {
      const received: Array<unknown> = []
      for await (const event of stream) {
        received.push(event)
      }
      return received
    })()

    // 触发看门狗超时
    await vi.advanceTimersByTimeAsync(1000)

    await streamPromise

    const finalResult = await stream.result()
    expect(finalResult.stopReason).toBe("error")
    expect(finalResult.errorMessage).toContain("Stream idle timeout after 1000ms")
  })

  it("用户主动取消时优先将 stopReason 标记为 aborted", async () => {
    const userController = new AbortController()
    let capturedAbortSignal: AbortSignal | undefined

    async function* createHangingStream() {
      yield { type: "text-start" as const }
      await new Promise<void>((_, reject) => {
        capturedAbortSignal?.addEventListener("abort", () => {
          reject(new Error("The operation was aborted"))
        })
      })
    }

    mockStreamText.mockImplementation((opts: { abortSignal?: AbortSignal }) => {
      capturedAbortSignal = opts.abortSignal
      return {
        fullStream: createHangingStream(),
      }
    })

    const streamFn = createAiSdkStreamFn({ idleTimeoutMs: 5000 })
    const stream = await streamFn(
      TEST_MODEL,
      { systemPrompt: "", messages: [] },
      { signal: userController.signal },
    )

    const streamPromise = (async () => {
      for await (const _ of stream) {
        // consume
      }
    })()

    // 200ms 后用户主动中止
    await vi.advanceTimersByTimeAsync(200)
    userController.abort()

    await streamPromise

    const finalResult = await stream.result()
    expect(finalResult.stopReason).toBe("aborted")
    expect(finalResult.errorMessage).toBe("Request was aborted")
  })

  it("持续接收 chunk 时看门狗重置计时器，长文本流正常完成", async () => {
    async function* createSlowStreaming() {
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 800))
        yield { type: "text-delta" as const, text: `chunk-${i} ` }
      }
      yield {
        type: "finish" as const,
        finishReason: "stop",
        totalUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      }
    }

    mockStreamText.mockReturnValue({
      fullStream: createSlowStreaming(),
    })

    const streamFn = createAiSdkStreamFn({ idleTimeoutMs: 1000 })
    const stream = await streamFn(TEST_MODEL, { systemPrompt: "", messages: [] }, {})

    const streamPromise = (async () => {
      for await (const _ of stream) {
        // consume
      }
    })()

    // 每次推进 800ms，小于 1000ms 超时阈值，共 5 次
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(800)
    }

    await streamPromise

    const finalResult = await stream.result()
    expect(finalResult.stopReason).toBe("stop")
    expect(finalResult.content).toEqual([
      {
        type: "text",
        text: "chunk-0 chunk-1 chunk-2 chunk-3 chunk-4 ",
        durationMs: expect.any(Number),
      },
    ])
  })

  it("正确解析 reasoning-start/delta/end 流事件并生成 thinking 块", async () => {
    async function* createReasoningStream() {
      yield { type: "reasoning-start" as const }
      yield { type: "reasoning-delta" as const, text: "正在思考方案..." }
      yield { type: "reasoning-delta" as const, text: "已得出结论。" }
      yield { type: "reasoning-end" as const }
      yield { type: "text-start" as const }
      yield { type: "text-delta" as const, text: "最终回答" }
      yield {
        type: "finish" as const,
        finishReason: "stop",
        totalUsage: { inputTokens: 10, outputTokens: 25, totalTokens: 35 },
      }
    }

    mockStreamText.mockReturnValue({
      fullStream: createReasoningStream(),
    })

    const streamFn = createAiSdkStreamFn({ idleTimeoutMs: 5000 })
    const stream = await streamFn(TEST_MODEL, { systemPrompt: "", messages: [] }, {})

    const events: Array<unknown> = []
    for await (const event of stream) {
      events.push(event)
    }

    const finalResult = await stream.result()
    expect(finalResult.stopReason).toBe("stop")
    expect(finalResult.content).toEqual([
      { type: "thinking", thinking: "正在思考方案...已得出结论。", durationMs: expect.any(Number) },
      { type: "text", text: "最终回答", durationMs: expect.any(Number) },
    ])
    expect(finalResult.usage).toEqual({
      input: 10,
      output: 25,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 35,
    })
  })

  it("reasoning-delta 携带 Anthropic signature 时写入 thinking 块", async () => {
    async function* createSignedReasoningStream() {
      yield { type: "reasoning-start" as const }
      yield { type: "reasoning-delta" as const, text: "带签名的思考" }
      // @ai-sdk/anthropic 以空文本 delta 单独下发 signature_delta。
      yield {
        type: "reasoning-delta" as const,
        text: "",
        providerMetadata: { anthropic: { signature: "sig-delta" } },
      }
      yield { type: "reasoning-end" as const }
      yield {
        type: "finish" as const,
        finishReason: "tool-calls",
        totalUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      }
    }

    mockStreamText.mockReturnValue({ fullStream: createSignedReasoningStream() })

    const streamFn = createAiSdkStreamFn({ idleTimeoutMs: 5000 })
    const stream = await streamFn(TEST_MODEL, { systemPrompt: "", messages: [] }, {})
    for await (const _ of stream) {
      // consume
    }

    const finalResult = await stream.result()
    expect(finalResult.content).toEqual([
      {
        type: "thinking",
        thinking: "带签名的思考",
        signature: "sig-delta",
        durationMs: expect.any(Number),
      },
    ])
  })

  it("reasoning-end 携带 Anthropic signature 时同样被保留", async () => {
    async function* createSignedEndStream() {
      yield { type: "reasoning-start" as const }
      yield { type: "reasoning-delta" as const, text: "思考" }
      yield {
        type: "reasoning-end" as const,
        providerMetadata: { anthropic: { signature: "sig-end" } },
      }
      yield {
        type: "finish" as const,
        finishReason: "stop",
        totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }
    }

    mockStreamText.mockReturnValue({ fullStream: createSignedEndStream() })

    const streamFn = createAiSdkStreamFn({ idleTimeoutMs: 5000 })
    const stream = await streamFn(TEST_MODEL, { systemPrompt: "", messages: [] }, {})
    for await (const _ of stream) {
      // consume
    }

    const finalResult = await stream.result()
    expect(finalResult.content[0]).toMatchObject({
      type: "thinking",
      thinking: "思考",
      signature: "sig-end",
    })
  })

  it("无文本的空思考块不上库（上游未回 summary 的场景）", async () => {
    async function* createEmptyThinkingStream() {
      yield { type: "reasoning-start" as const }
      yield { type: "reasoning-end" as const }
      yield { type: "text-start" as const }
      yield { type: "text-delta" as const, text: "最终回答" }
      yield {
        type: "finish" as const,
        finishReason: "stop",
        totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }
    }

    mockStreamText.mockReturnValue({ fullStream: createEmptyThinkingStream() })

    const streamFn = createAiSdkStreamFn({ idleTimeoutMs: 5000 })
    const stream = await streamFn(TEST_MODEL, { systemPrompt: "", messages: [] }, {})
    for await (const _ of stream) {
      // consume
    }

    const finalResult = await stream.result()
    expect(finalResult.content).toEqual([
      { type: "text", text: "最终回答", durationMs: expect.any(Number) },
    ])
  })

  it("空白字符思考块不上库，但带签名的空块必须保留", async () => {
    async function* createMixedStream() {
      yield { type: "reasoning-start" as const }
      yield { type: "reasoning-delta" as const, text: "   " }
      yield { type: "reasoning-end" as const }
      yield { type: "text-start" as const }
      yield { type: "text-delta" as const, text: "x" }
      yield { type: "reasoning-start" as const }
      yield {
        type: "reasoning-delta" as const,
        text: "",
        providerMetadata: { anthropic: { signature: "sig-keep" } },
      }
      yield { type: "reasoning-end" as const }
      yield {
        type: "finish" as const,
        finishReason: "stop",
        totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }
    }

    mockStreamText.mockReturnValue({ fullStream: createMixedStream() })

    const streamFn = createAiSdkStreamFn({ idleTimeoutMs: 5000 })
    const stream = await streamFn(TEST_MODEL, { systemPrompt: "", messages: [] }, {})
    for await (const _ of stream) {
      // consume
    }

    const finalResult = await stream.result()
    expect(finalResult.content).toEqual([
      { type: "text", text: "x", durationMs: expect.any(Number) },
      {
        type: "thinking",
        thinking: "",
        signature: "sig-keep",
        durationMs: expect.any(Number),
      },
    ])
  })

  it("thinking + tool-call 双轮：第二轮请求回传带签名的 reasoning 块", async () => {
    async function* firstRoundStream() {
      yield { type: "reasoning-start" as const }
      yield { type: "reasoning-delta" as const, text: "先调用工具" }
      yield {
        type: "reasoning-delta" as const,
        text: "",
        providerMetadata: { anthropic: { signature: "sig-round-1" } },
      }
      yield { type: "reasoning-end" as const }
      yield { type: "tool-input-start" as const, id: "call-1", toolName: "echo" }
      yield {
        type: "tool-call" as const,
        toolCallId: "call-1",
        toolName: "echo",
        input: { text: "hi" },
      }
      yield {
        type: "finish" as const,
        finishReason: "tool-calls",
        totalUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      }
    }
    async function* secondRoundStream() {
      yield { type: "text-start" as const }
      yield { type: "text-delta" as const, text: "完成" }
      yield {
        type: "finish" as const,
        finishReason: "stop",
        totalUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      }
    }

    mockStreamText
      .mockReturnValueOnce({ fullStream: firstRoundStream() })
      .mockReturnValueOnce({ fullStream: secondRoundStream() })

    const echoTool: AgentTool<z.ZodType<{ text: string }>> = {
      name: "echo",
      label: "回显",
      description: "回显输入文本",
      inputSchema: z.object({ text: z.string() }),
      execute: async (_toolCallId, params) => ({
        content: [{ type: "text", text: `echo:${params.text}` }],
      }),
    }
    const agent = new Agent({
      streamFn: createAiSdkStreamFn({ idleTimeoutMs: 5000 }),
      initialState: { model: { provider: "anthropic", id: "claude-test" }, tools: [echoTool] },
    })

    await agent.prompt("hi")

    expect(mockStreamText).toHaveBeenCalledTimes(2)
    const secondRequest = mockStreamText.mock.calls[1]?.[0] as {
      messages: Array<{ role: string; content: Array<Record<string, unknown>> }>
    }
    const assistantMessage = secondRequest.messages.find((message) => message.role === "assistant")
    expect(assistantMessage?.content).toEqual(
      expect.arrayContaining([
        {
          type: "reasoning",
          text: "先调用工具",
          providerOptions: { anthropic: { signature: "sig-round-1" } },
        },
      ]),
    )
    // tool-call 与紧随的 tool-result 成对回传（无悬空工具调用）。
    expect(assistantMessage?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool-call", toolCallId: "call-1", toolName: "echo" }),
      ]),
    )
    const toolMessage = secondRequest.messages.find((message) => message.role === "tool")
    expect(toolMessage?.content[0]).toMatchObject({
      type: "tool-result",
      toolCallId: "call-1",
    })
  })

  it("当 text 块后紧随 tool-input 时，正确在 tool 开始时结算 text 耗时并立即创建 toolCall 块", async () => {
    async function* createTextAndToolStream() {
      yield { type: "text-start" as const }
      yield { type: "text-delta" as const, text: "正在渲染：" }
      yield { type: "tool-input-start" as const, id: "c-html", toolName: "render_html" }
      yield { type: "tool-input-delta" as const, id: "c-html", delta: '{"html":' }
      yield { type: "tool-input-delta" as const, id: "c-html", delta: '"<h1>App</h1>"}' }
      yield {
        type: "tool-call" as const,
        toolCallId: "c-html",
        toolName: "render_html",
        input: { html: "<h1>App</h1>" },
      }
      yield {
        type: "finish" as const,
        finishReason: "tool-calls",
        totalUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      }
    }

    mockStreamText.mockReturnValue({
      fullStream: createTextAndToolStream(),
    })

    const streamFn = createAiSdkStreamFn({ idleTimeoutMs: 5000 })
    const stream = await streamFn(TEST_MODEL, { systemPrompt: "", messages: [] }, {})

    const events: Array<{ type: string; toolCall?: unknown }> = []
    for await (const event of stream) {
      events.push(event as { type: string; toolCall?: unknown })
    }

    // 验证 toolcall_start 在 tool-input-start 阶段已立即分发
    expect(events.some((e) => e.type === "toolcall_start")).toBe(true)
    expect(events.some((e) => e.type === "toolcall_end")).toBe(true)

    const finalResult = await stream.result()
    expect(finalResult.content).toHaveLength(2)
    expect(finalResult.content[0]).toEqual({
      type: "text",
      text: "正在渲染：",
      durationMs: expect.any(Number),
    })
    expect(finalResult.content[1]).toEqual({
      type: "toolCall",
      id: "c-html",
      name: "render_html",
      arguments: { html: "<h1>App</h1>" },
    })
  })

  it("opencode Go Provider 不再注入任何附加请求头", async () => {
    async function* createMockStream() {
      yield {
        type: "finish" as const,
        finishReason: "stop",
        totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }
    }

    mockStreamText.mockReturnValue({ fullStream: createMockStream() })
    settingsState.settings.providers = {
      "oc-go": {
        id: "oc-go",
        type: "openai-compatible",
        name: "OpenCode Go",
        options: { apiKey: "sk-test", baseURL: "https://opencode.ai/zen/go/v1" },
        models: { "deepseek-v4.1-flash": { id: "deepseek-v4.1-flash", name: "DeepSeek" } },
      },
    }

    const streamFn = createAiSdkStreamFn({
      idleTimeoutMs: 5000,
      getSessionId: () => "ses_lx_42",
    })
    const stream = await streamFn(
      { provider: "oc-go", id: "deepseek-v4.1-flash" },
      { systemPrompt: "", messages: [] },
      {},
    )
    for await (const _ of stream) {
      // consume
    }
    await stream.result()

    const lastOptions = mockStreamText.mock.calls.at(-1)?.[0] as { headers?: unknown }
    expect(lastOptions.headers).toBeUndefined()
  })

  it("非 opencode Go Provider 不额外注入请求头", async () => {
    async function* createMockStream() {
      yield {
        type: "finish" as const,
        finishReason: "stop",
        totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }
    }

    mockStreamText.mockReturnValue({ fullStream: createMockStream() })
    settingsState.settings.providers = {
      compat: {
        id: "compat",
        type: "openai-compatible",
        name: "MiniMax",
        options: { apiKey: "sk-test", baseURL: "https://api.minimax.chat/v1" },
        models: { m: { id: "m", name: "m" } },
      },
    }

    const streamFn = createAiSdkStreamFn({ idleTimeoutMs: 5000 })
    const stream = await streamFn(
      { provider: "compat", id: "m" },
      { systemPrompt: "", messages: [] },
      {},
    )
    for await (const _ of stream) {
      // consume
    }
    await stream.result()

    const lastOptions = mockStreamText.mock.calls.at(-1)?.[0] as { headers?: unknown }
    expect(lastOptions.headers).toBeUndefined()
  })

  it("chat 请求开启 Caveman 时把风格提示词拼接到系统提示词", async () => {
    async function* createMockStream() {
      yield {
        type: "finish" as const,
        finishReason: "stop",
        totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }
    }

    mockStreamText.mockReturnValue({ fullStream: createMockStream() })
    settingsState.tokenSaver.cavemanEnabled = true

    const streamFn = createAiSdkStreamFn({ idleTimeoutMs: 5000, purpose: "chat" })
    const stream = await streamFn(TEST_MODEL, { systemPrompt: "base prompt", messages: [] }, {})
    for await (const _ of stream) {
      // consume
    }
    const finalMessage = await stream.result()

    const lastOptions = mockStreamText.mock.calls.at(-1)?.[0] as { system?: string }
    expect(lastOptions.system).toBe(`base prompt\n\n${CAVEMAN_PROMPTS.full}`)
    expect(finalMessage.tokenSaver).toEqual({ cavemanLevel: "full" })
  })

  it("非 chat purpose（title）不受 Token Saver 影响", async () => {
    async function* createMockStream() {
      yield {
        type: "finish" as const,
        finishReason: "stop",
        totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }
    }

    mockStreamText.mockReturnValue({ fullStream: createMockStream() })
    settingsState.tokenSaver.cavemanEnabled = true
    settingsState.tokenSaver.rtkEnabled = true

    const streamFn = createAiSdkStreamFn({ idleTimeoutMs: 5000, purpose: "title" })
    const stream = await streamFn(
      TEST_MODEL,
      { systemPrompt: "base prompt", messages: [makeLargeDiffToolResult()] },
      {},
    )
    for await (const _ of stream) {
      // consume
    }
    const finalMessage = await stream.result()

    const lastOptions = mockStreamText.mock.calls.at(-1)?.[0] as {
      system?: string
      messages: Array<{ role: string; content: Array<Record<string, unknown>> }>
    }
    expect(lastOptions.system).toBe("base prompt")
    expect(finalMessage.tokenSaver).toBeUndefined()
    const toolMessage = lastOptions.messages.find((message) => message.role === "tool")
    const output = toolMessage?.content[0]?.output as { type: string; value: string }
    expect(output.value.length).toBe(makeLargeDiff().length)
  })

  it("chat 请求开启 RTK 时压缩出站工具结果", async () => {
    async function* createMockStream() {
      yield {
        type: "finish" as const,
        finishReason: "stop",
        totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }
    }

    mockStreamText.mockReturnValue({ fullStream: createMockStream() })
    settingsState.tokenSaver.rtkEnabled = true

    const streamFn = createAiSdkStreamFn({ idleTimeoutMs: 5000, purpose: "chat" })
    const stream = await streamFn(
      TEST_MODEL,
      { systemPrompt: "", messages: [makeLargeDiffToolResult()] },
      {},
    )
    for await (const _ of stream) {
      // consume
    }
    const finalMessage = await stream.result()

    const lastOptions = mockStreamText.mock.calls.at(-1)?.[0] as {
      messages: Array<{ role: string; content: Array<Record<string, unknown>> }>
    }
    const toolMessage = lastOptions.messages.find((message) => message.role === "tool")
    const output = toolMessage?.content[0]?.output as { type: string; value: string }
    expect(output.value.length).toBeLessThan(makeLargeDiff().length)
    expect(finalMessage.tokenSaver?.rtkFilters).toEqual(["git-diff"])
    expect(finalMessage.tokenSaver?.rtkSavedChars).toBeGreaterThan(0)
  })
})

describe("OpenCode Go 会话请求头", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsState.settings = {
      providers: {
        "opencode-go": { id: "opencode-go", type: "openai-compatible", models: {} },
      },
      streamIdleTimeoutMs: undefined,
    }
  })

  const drainSuccess = async (
    streamFn: ReturnType<typeof createAiSdkStreamFn>,
    model: Model,
    options: Record<string, unknown>,
  ): Promise<void> => {
    async function* createMockStream() {
      yield { type: "text-start" as const }
      yield { type: "text-delta" as const, text: "ok" }
      yield {
        type: "finish" as const,
        finishReason: "stop",
        totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }
    }
    mockStreamText.mockReturnValue({ fullStream: createMockStream() })
    const stream = await streamFn(model, { systemPrompt: "", messages: [] }, options)
    for await (const _ of stream) {
      // consume
    }
  }

  it("Go 请求携带回调返回的 x-opencode-session", async () => {
    const streamFn = createAiSdkStreamFn({ getSessionId: () => "sess-123" })
    await drainSuccess(streamFn, { provider: "opencode-go", id: "m" }, {})

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { "x-opencode-session": "sess-123" } }),
    )
  })

  it("显式 options.sessionId 优先于回调", async () => {
    const streamFn = createAiSdkStreamFn({ getSessionId: () => "sess-cb" })
    await drainSuccess(streamFn, { provider: "opencode-go", id: "m" }, { sessionId: "sess-opt" })

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { "x-opencode-session": "sess-opt" } }),
    )
  })

  it("无会话时回退 draft-session，保证请求可被路由", async () => {
    const streamFn = createAiSdkStreamFn({})
    await drainSuccess(streamFn, { provider: "opencode-go", id: "m" }, {})

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { "x-opencode-session": "draft-session" } }),
    )
  })

  it("非 Go Provider 不发送会话头", async () => {
    const streamFn = createAiSdkStreamFn({ getSessionId: () => "sess-123" })
    await drainSuccess(streamFn, { provider: "other", id: "m" }, {})

    const call = mockStreamText.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call).not.toHaveProperty("headers")
  })
})

describe("opencode 式思考等级参数翻译", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsState.settings = {
      providers: {
        "anthropic-p": {
          id: "anthropic-p",
          type: "anthropic",
          models: {
            m3: {
              id: "minimax-m3",
              variants: {
                none: { thinking: { type: "disabled" } },
                thinking: { thinking: { type: "adaptive" } },
              },
            },
            flash: {
              id: "qwen3.8-flash",
              variants: { high: { effort: "high" } },
            },
          },
        },
        "openai-p": {
          id: "openai-p",
          type: "openai",
          models: {
            grok: {
              id: "grok-4.6",
              variants: {
                high: {
                  reasoningEffort: "high",
                  reasoningSummary: "auto",
                  include: ["reasoning.encrypted_content"],
                },
              },
            },
          },
        },
        "go-p": {
          id: "opencode-go",
          type: "openai-compatible",
          options: { apiKey: "sk-go", baseURL: "https://opencode.ai/zen/go/v1" },
          models: {
            spark: {
              id: "muse-spark-1.3-contributor",
              transport: "openai-responses",
              variants: {
                xhigh: {
                  reasoningEffort: "xhigh",
                  reasoningSummary: "auto",
                  include: ["reasoning.encrypted_content"],
                },
              },
            },
            sparkDefault: {
              id: "muse-spark-1.2-contributor",
              transport: "openai-responses",
              variants: {
                medium: {
                  reasoningEffort: "medium",
                  reasoningSummary: "auto",
                  include: ["reasoning.encrypted_content"],
                },
              },
            },
          },
        },
      },
      streamIdleTimeoutMs: undefined,
    }
  })

  const drainWithVariant = async (model: Model, variant: string): Promise<unknown> => {
    async function* createMockStream() {
      yield { type: "text-start" as const }
      yield { type: "text-delta" as const, text: "ok" }
      yield {
        type: "finish" as const,
        finishReason: "stop",
        totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }
    }
    mockStreamText.mockReturnValue({ fullStream: createMockStream() })
    const streamFn = createAiSdkStreamFn({})
    const stream = await streamFn({ ...model, variant }, { systemPrompt: "", messages: [] }, {})
    for await (const _ of stream) {
      // consume
    }
    return mockStreamText.mock.calls[0]?.[0]
  }

  it("anthropic 通路透传 thinking 对象", async () => {
    const call = (await drainWithVariant({ provider: "anthropic-p", id: "m3" }, "thinking")) as {
      providerOptions: Record<string, Record<string, unknown>>
    }

    expect(call.providerOptions["anthropic"]["thinking"]).toEqual({ type: "adaptive" })
  })

  it("anthropic 通路透传 effort 裸键", async () => {
    const call = (await drainWithVariant({ provider: "anthropic-p", id: "flash" }, "high")) as {
      providerOptions: Record<string, Record<string, unknown>>
    }

    expect(call.providerOptions["anthropic"]["effort"]).toBe("high")
  })

  it("openai 通路透传档位 + 摘要 + 加密推理三件套", async () => {
    const call = (await drainWithVariant({ provider: "openai-p", id: "grok" }, "high")) as {
      providerOptions: Record<string, Record<string, unknown>>
    }

    expect(call.providerOptions["openai"]).toMatchObject({
      reasoningEffort: "high",
      reasoningSummary: "auto",
      include: ["reasoning.encrypted_content"],
    })
  })

  it("openai 通路不强制推理判定（chat 的 reasoning_effort 本就直传）", async () => {
    const call = (await drainWithVariant({ provider: "openai-p", id: "grok" }, "high")) as {
      providerOptions: Record<string, Record<string, unknown>>
    }

    expect(call.providerOptions["openai"]).not.toHaveProperty("forceReasoning")
  })

  it("responses 通路强制推理判定：第三方模型 ID 也能送出 reasoning", async () => {
    const call = (await drainWithVariant({ provider: "go-p", id: "spark" }, "xhigh")) as {
      providerOptions: Record<string, Record<string, unknown>>
    }

    // SDK 按 ID 前缀判定推理模型，muse-spark 会被误判；forceReasoning 保证
    // reasoning: { effort, summary } 上线，否则思考流永不到达。
    expect(call.providerOptions["openai"]).toMatchObject({
      reasoningEffort: "xhigh",
      reasoningSummary: "auto",
      forceReasoning: true,
    })
  })

  it("responses 通路无选中档位时不带推理参数（与 opencode 开箱行为一致）", async () => {
    const call = (await drainWithVariant({ provider: "go-p", id: "sparkDefault" }, "")) as {
      providerOptions: Record<string, Record<string, unknown>>
    }

    expect(call.providerOptions ?? {}).not.toHaveProperty("openai")
  })
})
