import type { ModelProviderSettings } from "@shared/settings"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { invalidateModelCache, resolveLanguageModel } from "@/agent/stream/modelFactory"

const mockChat = vi.fn().mockReturnValue({ id: "chat-model" })
const mockResponses = vi.fn().mockReturnValue({ id: "responses-model" })
const mockCreateOpenAI = vi.fn().mockReturnValue({ chat: mockChat, responses: mockResponses })
const mockChatAnthropic = vi.fn().mockReturnValue({ id: "anthropic-model" })
const mockCreateAnthropic = vi.fn().mockReturnValue({ chat: mockChatAnthropic })
const mockCreateOpenAICompatible = vi
  .fn()
  .mockReturnValue({ languageModel: vi.fn().mockReturnValue({ id: "compat-model" }) })

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: (options: unknown) => mockCreateOpenAI(options),
}))
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: (options: unknown) => mockCreateAnthropic(options),
}))
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => ({ chat: vi.fn() }),
}))
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: (options: unknown) => mockCreateOpenAICompatible(options),
}))
vi.mock("ai", () => ({
  extractReasoningMiddleware: () => ({ name: "extract-reasoning" }),
  wrapLanguageModel: ({ model }: { model: unknown }) => ({ wrapped: model }),
}))

let mockSettings: ModelProviderSettings

vi.mock("@/services/settingsService", () => ({
  getModelProviderSettings: () => mockSettings,
}))

describe("modelFactory OpenCode Go 单预设", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateModelCache()
    mockSettings = {
      enabledProviders: ["opencode-go", "plain-compat"],
      providers: {
        "opencode-go": {
          id: "opencode-go",
          type: "openai-compatible",
          name: "OpenCode Go",
          options: { apiKey: "sk-go", baseURL: "https://opencode.ai/zen/go/v1" },
          models: {
            "kimi-k2.7-code": { id: "kimi-k2.7-code", name: "Kimi K2.7 Code" },
            "minimax-m3": { id: "minimax-m3", name: "MiniMax M3", transport: "anthropic" },
            "grok-4.6": { id: "grok-4.6", name: "Grok 4.6", transport: "openai-responses" },
          },
        },
        "plain-compat": {
          id: "plain-compat",
          type: "openai-compatible",
          name: "Plain",
          options: { apiKey: "sk-plain", baseURL: "https://api.example.com/v1" },
          models: { m: { id: "m", name: "M" } },
        },
      },
      defaultModel: { provider: "opencode-go", model: "kimi-k2.7-code" },
      titleSummary: { provider: "opencode-go", model: "kimi-k2.7-code" },
      suggestedQuestions: { provider: "opencode-go", model: "kimi-k2.7-code" },
      suggestedQuestionsEnabled: true,
      compactionEnabled: true,
    }
  })

  afterEach(() => {
    invalidateModelCache()
  })

  it("无覆盖的模型继承 provider.type", () => {
    resolveLanguageModel({ provider: "opencode-go", id: "kimi-k2.7-code" })
    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith({
      name: "opencode-go",
      baseURL: "https://opencode.ai/zen/go/v1",
      apiKey: "sk-go",
      headers: { "x-opencode-client": "lx-agent" },
    })
  })

  it("anthropic 覆盖的模型走 Anthropic SDK", () => {
    resolveLanguageModel({ provider: "opencode-go", id: "minimax-m3" })
    expect(mockCreateAnthropic).toHaveBeenCalledWith({
      apiKey: "sk-go",
      baseURL: "https://opencode.ai/zen/go/v1",
      headers: {
        "anthropic-beta": "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
        "x-opencode-client": "lx-agent",
      },
    })
    expect(mockChatAnthropic).toHaveBeenCalledWith("minimax-m3")
  })

  it("responses 覆盖的模型走 Responses API", () => {
    resolveLanguageModel({ provider: "opencode-go", id: "grok-4.6" })
    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-go",
      baseURL: "https://opencode.ai/zen/go/v1",
      headers: { "x-opencode-client": "lx-agent" },
    })
    expect(mockResponses).toHaveBeenCalledWith("grok-4.6")
    expect(mockChat).not.toHaveBeenCalled()
  })

  it("非 Go Provider 不携带静态客户端头", () => {
    resolveLanguageModel({ provider: "plain-compat", id: "m" })
    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith({
      name: "plain-compat",
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-plain",
    })
  })
})
