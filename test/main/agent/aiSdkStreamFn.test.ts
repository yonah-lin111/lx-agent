import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Model } from "@/agent/core/types"
import { createAiSdkStreamFn } from "@/agent/stream/aiSdkStreamFn"

// Mock modelFactory
vi.mock("@/agent/stream/modelFactory", () => ({
  resolveLanguageModel: vi.fn().mockReturnValue({}),
}))

// Mock ai streamText
const mockStreamText = vi.fn()
vi.mock("ai", () => ({
  stepCountIs: vi.fn().mockReturnValue(() => false),
  streamText: (options: unknown) => mockStreamText(options),
}))

const TEST_MODEL: Model = { provider: "test-provider", id: "test-model" }

describe("createAiSdkStreamFn 与流式看门狗集成", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
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
    expect(finalResult.content).toEqual([{ type: "text", text: "你好，世界！" }])
    expect(finalResult.usage).toEqual({
      input: 10,
      output: 20,
      cacheRead: 0,
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
      { type: "text", text: "chunk-0 chunk-1 chunk-2 chunk-3 chunk-4 " },
    ])
  })
})
