import type { AgentMessage, AssistantMessage, Usage } from "@shared/contracts/agent"
import { streamText } from "ai"
import { beforeEach, describe, expect, it, vi } from "vitest"

// mock ai.streamText：摘要生成返回可控文本，避免真实 LLM 调用。
vi.mock("ai", () => ({ streamText: vi.fn() }))

// Mock settings with a mutable object so we can change config values in tests.
const mockSettings = {
  providers: {
    p: {
      id: "p",
      type: "openai-compatible" as const,
      name: "p",
      options: { apiKey: "x", baseURL: "http://localhost" },
      models: {
        m: { id: "m", name: "m" },
        compaction_m: { id: "compaction_m", name: "compaction_m" },
      },
    },
  },
  enabledProviders: ["p"],
  defaultModel: { provider: "p", model: "m" },
  titleSummary: { provider: "p", model: "m" },
  suggestedQuestions: { provider: "p", model: "m" },
  compactionModel: { provider: "", model: "" },
  suggestedQuestionsEnabled: true,
}

// mock settingsService：返回可变的 mockSettings 方便动态测试。
vi.mock("@/services/settingsService", () => ({
  getModelProviderSettings: () => mockSettings,
}))

import {
  estimateContextTokens,
  estimateMessageTokens,
  findCutPoint,
  generateCompactionSummary,
  isContextOverflowFailure,
  resolveCompactionModelId,
} from "@/agent/compaction"

const streamTextMock = vi.mocked(streamText)

const EMPTY_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, totalTokens: 0 }

// 构造消息。
const user = (text: string): AgentMessage => ({ role: "user", content: text, timestamp: 0 })
const assistant = (text: string, usage: Usage = EMPTY_USAGE): AssistantMessage => ({
  role: "assistant",
  content: [{ type: "text", text }],
  provider: "p",
  model: "m",
  usage,
  stopReason: "stop",
  timestamp: 0,
})
const toolResult = (toolName: string, text: string): AgentMessage => ({
  role: "toolResult",
  toolCallId: "t1",
  toolName,
  content: [{ type: "text", text }],
  isError: false,
  timestamp: 0,
})

// 模拟 streamText 返回指定文本与 usage。
const mockStream = (text: string, usage = { inputTokens: 0, outputTokens: 0 }): void => {
  streamTextMock.mockReturnValueOnce({
    text: Promise.resolve(text),
    usage: Promise.resolve(usage),
  } as never)
}

describe("estimateContextTokens", () => {
  it("复用最后一条 assistant 的 usage.totalTokens 作锚点，其后消息按 char/4 累加", () => {
    const messages: AgentMessage[] = [
      user("问题"),
      assistant("回答", { input: 800, output: 200, cacheRead: 0, totalTokens: 1000 }),
      toolResult("grep", "匹配结果"),
    ]
    // 锚点 1000 + toolResult（5 字符 → ceil(5/4)=2）。
    expect(estimateContextTokens(messages)).toBe(1000 + estimateMessageTokens(messages[2]))
  })

  it("无 assistant 时纯字符估计", () => {
    const messages: AgentMessage[] = [user("abcdefgh"), toolResult("grep", "1234")]
    expect(estimateContextTokens(messages)).toBe(
      estimateMessageTokens(messages[0]) + estimateMessageTokens(messages[1]),
    )
  })

  it("空消息返回 0", () => {
    expect(estimateContextTokens([])).toBe(0)
  })
})

describe("findCutPoint", () => {
  it("从尾部累计至预算满足，返回保留起点索引", () => {
    // 每条 10 token：预算 25 → 尾部 3 条（30 ≥ 25）保留，起点 index 2。
    const messages: AgentMessage[] = [
      user("a".repeat(40)),
      assistant("b".repeat(40)),
      user("c".repeat(40)),
      assistant("d".repeat(40)),
      user("e".repeat(40)),
    ]
    const cutIndex = findCutPoint(messages, 25)
    expect(cutIndex).toBe(2)
  })

  it("不切在 toolResult 中间（提升保留起点到完整 turn 边界）", () => {
    const messages: AgentMessage[] = [
      user("a".repeat(40)),
      assistant("b".repeat(40)),
      toolResult("grep", "c".repeat(40)),
      user("d".repeat(40)),
      assistant("e".repeat(40)),
    ]
    // 尾部累计：index4(10) < 预算 25；index3(+10=20) < 25；index2(+10=30) ≥ 25 → cutIndex=2。
    // messages[2] 是 toolResult → 提升到 index3。
    expect(findCutPoint(messages, 25)).toBe(3)
  })

  it("全部消息累计不足预算时返回 messages.length（全部保留）", () => {
    const messages: AgentMessage[] = [user("a"), assistant("b")]
    expect(findCutPoint(messages, 100)).toBe(2)
  })
})

describe("isContextOverflowFailure", () => {
  it("匹配常见 provider overflow 错误签名", () => {
    expect(isContextOverflowFailure("context_length_exceeded")).toBe(true)
    expect(isContextOverflowFailure("This model's maximum context length is 128000")).toBe(true)
    expect(isContextOverflowFailure("Prompt is too long")).toBe(true)
    expect(isContextOverflowFailure("too many tokens")).toBe(true)
  })

  it("非 overflow 错误不命中", () => {
    expect(isContextOverflowFailure("rate limit exceeded")).toBe(false)
    expect(isContextOverflowFailure("network error")).toBe(false)
    expect(isContextOverflowFailure("")).toBe(false)
  })
})

describe("generateCompactionSummary", () => {
  beforeEach(() => {
    streamTextMock.mockReset()
  })

  it("为历史消息生成结构化摘要", async () => {
    mockStream("<think>思考</think>\n目标：实现登录。已完成：搭建表单。", {
      inputTokens: 100,
      outputTokens: 50,
    })
    const result = await generateCompactionSummary([
      user("实现登录页"),
      assistant("已完成表单搭建"),
    ])
    expect(result).toEqual({
      summary: "目标：实现登录。已完成：搭建表单。",
      model: "m",
      usage: { input: 100, output: 50 },
    })
  })

  it("LLM 抛错返回 null（不抛错）", async () => {
    streamTextMock.mockRejectedValueOnce(new Error("network"))
    const summary = await generateCompactionSummary([user("test")])
    expect(summary).toBeNull()
  })

  it("空输入返回 null 且不调用 LLM", async () => {
    const summary = await generateCompactionSummary([])
    expect(summary).toBeNull()
    expect(streamTextMock).not.toHaveBeenCalled()
  })

  it("当 compactionModel 未配置时，优先使用传入的 sessionModel，若无则回退使用 titleSummary", async () => {
    // 1. compactionModel 未配置，未传入 sessionModel -> 回退到 titleSummary ("m")
    mockSettings.compactionModel = { provider: "", model: "" }
    mockSettings.titleSummary = { provider: "p", model: "m" }
    mockStream("摘要")
    await generateCompactionSummary([user("test")])
    expect(streamTextMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ modelId: "m" }),
      }),
    )

    // 2. compactionModel 未配置，传入了 sessionModel ("compaction_m") -> 使用 sessionModel
    mockStream("摘要2")
    await generateCompactionSummary([user("test")], { provider: "p", model: "compaction_m" })
    expect(streamTextMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ modelId: "compaction_m" }),
      }),
    )
  })

  it("当 compactionModel 配置了具体模型时，应该始终使用 compactionModel", async () => {
    mockSettings.compactionModel = { provider: "p", model: "compaction_m" }
    mockStream("摘要")
    await generateCompactionSummary([user("test")], { provider: "p", model: "m" })
    expect(streamTextMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ modelId: "compaction_m" }),
      }),
    )
  })
})

describe("resolveCompactionModelId", () => {
  it("当 compactionModel 未配置时，应根据 sessionModel 和 titleSummary 进行解析", () => {
    // 1. compactionModel 未配置，且未传入 sessionModel -> 回退到 titleSummary
    mockSettings.compactionModel = { provider: "", model: "" }
    mockSettings.titleSummary = { provider: "p", model: "m" }
    expect(resolveCompactionModelId()).toBe("m")

    // 2. compactionModel 未配置，且传入了 sessionModel -> 使用 sessionModel
    expect(resolveCompactionModelId({ provider: "p", model: "compaction_m" })).toBe("compaction_m")
  })

  it("当 compactionModel 配置了具体模型时，应始终解析为 compactionModel", () => {
    mockSettings.compactionModel = { provider: "p", model: "compaction_m" }
    expect(resolveCompactionModelId({ provider: "p", model: "m" })).toBe("compaction_m")
  })
})
