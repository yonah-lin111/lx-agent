import { streamText } from "ai"
import { beforeEach, describe, expect, it, vi } from "vitest"

// mock ai.streamText：避免真实 LLM 调用。
vi.mock("ai", () => ({
  streamText: vi.fn(),
  wrapLanguageModel: ({ model }: { model: unknown }) => model,
  extractReasoningMiddleware: vi.fn(),
}))

// mock usage 记录：避免测试触碰数据库。
vi.mock("@/agent/usageRecorder", () => ({
  recordModelCall: vi.fn(),
  toUsage: () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
}))

// 共享可变 settings：按用例切换 Provider 配置。
const settingsState = vi.hoisted(() => ({
  settings: {
    providers: {
      p: {
        id: "p",
        type: "openai-compatible",
        name: "p",
        options: { apiKey: "x", baseURL: "http://localhost" },
        models: { m: { id: "m", name: "m" } },
      },
    },
    enabledProviders: ["p"],
    defaultModel: { provider: "p", model: "m" },
  } as Record<string, unknown>,
}))

vi.mock("@/services/settingsService", () => ({
  getModelProviderSettings: () => settingsState.settings,
}))

import { askBtwQuestion, buildBtwMessages } from "@/agent/btwAskGenerator"

const DEFAULT_PROVIDERS = settingsState.settings.providers

describe("buildBtwMessages", () => {
  it("主会话上下文按预算裁剪，侧问历史附后，问题在最后", () => {
    const messages = buildBtwMessages(
      {
        context: [{ role: "user", content: "a".repeat(100) }],
        history: [
          { role: "user", content: "h1" },
          { role: "assistant", content: "h2" },
        ],
        question: "q",
      },
      10,
    )

    expect(messages[0]).toEqual({ role: "user", content: "a".repeat(10) })
    expect(messages.slice(1)).toEqual([
      { role: "user", content: "h1" },
      { role: "assistant", content: "h2" },
      { role: "user", content: "q" },
    ])
  })

  it("侧问历史过滤空内容", () => {
    const messages = buildBtwMessages(
      {
        context: [],
        history: [
          { role: "user", content: "  " },
          { role: "assistant", content: "h2" },
        ],
        question: "q",
      },
      100,
    )

    expect(messages).toEqual([
      { role: "assistant", content: "h2" },
      { role: "user", content: "q" },
    ])
  })
})

describe("askBtwQuestion", () => {
  beforeEach(() => {
    settingsState.settings.providers = DEFAULT_PROVIDERS
    vi.mocked(streamText).mockReset()
  })

  it("无 provider 时返回错误结果，不调用模型", async () => {
    settingsState.settings.providers = {}

    const result = await askBtwQuestion({
      context: [],
      history: [],
      question: "这个报错在哪？",
    })

    expect(result.ok).toBe(false)
    expect(streamText).not.toHaveBeenCalled()
  })

  it("成功时无工具调用模型并返回完整回答", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      text: Promise.resolve("  在 agent.ts 里。  "),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
    } as never)

    const result = await askBtwQuestion({
      context: [{ role: "user", content: "主会话问题" }],
      history: [{ role: "assistant", content: "上一次侧问回答" }],
      question: "这个报错在哪？",
    })

    expect(result).toEqual({ ok: true, answer: "在 agent.ts 里。" })
    const options = vi.mocked(streamText).mock.calls.at(-1)?.[0] as {
      tools?: unknown
      messages: { role: string; content: string }[]
    }
    expect(options.tools).toBeUndefined()
    expect(options.messages[0]?.role).toBe("system")
    expect(options.messages.at(-1)).toEqual({ role: "user", content: "这个报错在哪？" })
    expect(options.messages.map((message) => message.content)).toContain("上一次侧问回答")
  })

  it("模型抛错时返回错误结果，不向 IPC 抛异常", async () => {
    vi.mocked(streamText).mockImplementationOnce(() => {
      throw new Error("provider exploded")
    })

    const result = await askBtwQuestion({
      context: [],
      history: [],
      question: "这个报错在哪？",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("provider exploded")
    }
  })

  it("空回答视为失败", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      text: Promise.resolve("   "),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 0 }),
    } as never)

    const result = await askBtwQuestion({
      context: [],
      history: [],
      question: "这个报错在哪？",
    })

    expect(result.ok).toBe(false)
  })
})
