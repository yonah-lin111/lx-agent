import type { AssistantMessage, TextContent, ThinkingContent } from "@shared/contracts/agent"
import { beforeEach, describe, expect, it, vi } from "vitest"

// 共享可变 settings 状态：按用例切换 titleSummary 配置。
const settings = vi.hoisted(() => ({
  titleSummary: { provider: "p", model: "m" } as { provider: string; model: string } | undefined,
}))

// mock ai.streamText：返回可控文本，避免真实 LLM 调用。
vi.mock("ai", () => ({ streamText: vi.fn() }))

// mock settingsService：titleSummary 指向固定模型。
vi.mock("@/services/settingsService", () => ({
  getModelProviderSettings: () => ({
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
    titleSummary: settings.titleSummary,
    suggestedQuestions: { provider: "p", model: "m" },
    suggestedQuestionsEnabled: true,
  }),
}))

import { streamText } from "ai"
import { generateSessionTitle } from "@/agent/titleGenerator"

const streamTextMock = vi.mocked(streamText)

// 构造文本流：streamText 同步返回 StreamTextResult，text 为 Promise<string>。
const mockStream = (text: string): void => {
  streamTextMock.mockReturnValueOnce({ text: Promise.resolve(text) } as never)
}

// 构造一条 assistant 消息。
const assistant = (blocks: (TextContent | ThinkingContent)[]): AssistantMessage => ({
  role: "assistant",
  content: blocks,
  provider: "p",
  model: "m",
  usage: { input: 0, output: 0, totalTokens: 0 },
  stopReason: "stop",
  timestamp: 0,
})

describe("generateSessionTitle", () => {
  beforeEach(() => {
    streamTextMock.mockReset()
    settings.titleSummary = { provider: "p", model: "m" }
  })

  it("由首轮 user 消息文本生成标题", async () => {
    mockStream("修复登录页样式")
    const title = await generateSessionTitle([
      { role: "user", content: "请帮我修复登录页的样式问题", timestamp: 0 },
      assistant([{ type: "text", text: "我检查了登录页的 CSS，发现按钮间距不对。" }]),
    ])
    expect(title).toBe("修复登录页样式")
  })

  it("只用 user 消息，忽略 assistant 回答与 toolResult", async () => {
    mockStream("实现用户注册")
    const title = await generateSessionTitle([
      { role: "user", content: "实现用户注册功能", timestamp: 0 },
      assistant([{ type: "text", text: "我建议用邮箱注册方案。" }]),
      {
        role: "toolResult",
        toolCallId: "t1",
        toolName: "grep",
        content: [{ type: "text", text: "找到 3 处匹配" }],
        isError: false,
        timestamp: 0,
      },
    ])
    expect(title).toBe("实现用户注册")
  })

  it("去除 think 标签、取第一行非空", async () => {
    mockStream("<think>内部思考</think>\n\n优化查询性能")
    const title = await generateSessionTitle([
      { role: "user", content: "优化数据库查询", timestamp: 0 },
      assistant([{ type: "text", text: "done" }]),
    ])
    expect(title).toBe("优化查询性能")
  })

  it("超 40 字符截断兜底", async () => {
    const longTitle =
      "这是一个非常非常非常非常长的标题，用来验证超过四十个字符上限时截断行为是否正确表现"
    mockStream(longTitle)
    const title = await generateSessionTitle([{ role: "user", content: "test", timestamp: 0 }])
    expect(title?.length).toBe(40)
  })

  it("无 user 消息（只有 assistant）返回 null", async () => {
    mockStream("任意")
    const title = await generateSessionTitle([
      assistant([{ type: "thinking", thinking: "只有思考" }]),
    ])
    expect(title).toBeNull()
  })

  it("LLM 抛错返回 null（不抛错）", async () => {
    streamTextMock.mockRejectedValueOnce(new Error("network"))
    const title = await generateSessionTitle([{ role: "user", content: "test", timestamp: 0 }])
    expect(title).toBeNull()
  })

  it("无 titleSummary 模型配置时返回 null 且不调用 LLM", async () => {
    settings.titleSummary = undefined
    const title = await generateSessionTitle([{ role: "user", content: "test", timestamp: 0 }])
    expect(title).toBeNull()
    expect(streamTextMock).not.toHaveBeenCalled()
  })
})
