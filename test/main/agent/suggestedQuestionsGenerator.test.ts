import type { SuggestedQuestionContextMessage } from "@shared/contracts/agent"
import { streamText } from "ai"
import { describe, expect, it, vi } from "vitest"

// mock ai.streamText：避免真实 LLM 调用。
vi.mock("ai", () => ({
  streamText: vi.fn(),
  wrapLanguageModel: ({ model }: { model: unknown }) => model,
  extractReasoningMiddleware: vi.fn(),
}))

// 共享可变 settings：按用例切换 Provider baseURL（opencode Go 头注入）。
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
    titleSummary: { provider: "p", model: "m" },
    suggestedQuestions: { provider: "p", model: "m" },
    suggestedQuestionsEnabled: true,
  },
}))

vi.mock("@/services/settingsService", () => ({
  getModelProviderSettings: () => settingsState.settings,
}))

import {
  generateSuggestedQuestions,
  parseSuggestedQuestions,
  trimSuggestedQuestionContext,
} from "@/agent/suggestedQuestionsGenerator"

describe("parseSuggestedQuestions", () => {
  it("解析 JSON 数组并保留 2-4 条非空去重文本", () => {
    const content = JSON.stringify(["如何优化？", "如何优化？", "怎样写单测？", "", "  "])
    expect(parseSuggestedQuestions(content)).toEqual(["如何优化？", "怎样写单测？"])
  })

  it("解析 markdown 围栏包裹的 JSON", () => {
    const content = '```json\n["问题一", "问题二", "问题三"]\n```'
    expect(parseSuggestedQuestions(content)).toEqual(["问题一", "问题二", "问题三"])
  })

  it("解析带 questions 键的对象", () => {
    const content = JSON.stringify({ questions: ["a", "b", "c"] })
    expect(parseSuggestedQuestions(content)).toEqual(["a", "b", "c"])
  })

  it("解析常见编号列表并仅保留问句", () => {
    const content = "1. 第一个问题？\n2. 第二个问题？\n普通陈述句"
    expect(parseSuggestedQuestions(content)).toEqual(["第一个问题？", "第二个问题？"])
  })

  it("不足 2 条时返回空数组", () => {
    expect(parseSuggestedQuestions('["仅一个问题"]')).toEqual([])
    expect(parseSuggestedQuestions("无有效内容")).toEqual([])
  })

  it("最多返回 4 条", () => {
    const content = JSON.stringify(["q1", "q2", "q3", "q4", "q5"])
    expect(parseSuggestedQuestions(content)).toHaveLength(4)
  })
})

describe("trimSuggestedQuestionContext", () => {
  const makeMessage = (content: string): SuggestedQuestionContextMessage => ({
    role: "user",
    content,
  })

  it("保留最近的上下文并按预算截断", () => {
    const messages = [makeMessage("a"), makeMessage("bb"), makeMessage("ccc")]
    const result = trimSuggestedQuestionContext(messages, 5)
    expect(result.map((item) => item.content)).toEqual(["bb", "ccc"])
  })

  it("预算耗尽后停止，并把更早消息截断到剩余预算", () => {
    const messages = [makeMessage("x".repeat(100)), makeMessage("y".repeat(100))]
    const result = trimSuggestedQuestionContext(messages, 120)
    expect(result).toEqual([makeMessage("x".repeat(20)), makeMessage("y".repeat(100))])
  })

  it("最多保留最近 12 条", () => {
    const messages = Array.from({ length: 16 }, (_, index) => makeMessage(`msg${index}`))
    const result = trimSuggestedQuestionContext(messages, 100_000)
    expect(result).toHaveLength(12)
    expect(result.at(-1)?.content).toBe("msg15")
  })

  it("空输入返回空数组", () => {
    expect(trimSuggestedQuestionContext([], 100)).toEqual([])
  })
})

describe("generateSuggestedQuestions 请求头", () => {
  it("opencode Go Provider 使用合成会话 ID 头", async () => {
    const streamTextMock = vi.mocked(streamText)
    streamTextMock.mockReset()
    streamTextMock.mockReturnValueOnce({
      text: Promise.resolve('["问题一？","问题二？"]'),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
    } as never)

    settingsState.settings.providers.p.options.baseURL = "https://opencode.ai/zen/go/v1"
    const questions = await generateSuggestedQuestions([{ role: "user", content: "hi" }])

    expect(questions).toEqual(["问题一？", "问题二？"])
    expect(streamTextMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-opencode-session": "lx-agent:suggested-questions",
          "user-agent": expect.stringMatching(/^lx-agent\//),
        }),
      }),
    )
    settingsState.settings.providers.p.options.baseURL = "http://localhost"
  })
})
