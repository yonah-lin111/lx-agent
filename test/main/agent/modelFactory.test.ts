import type { ModelProviderSettings } from "@shared/settings"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  invalidateModelCache,
  resolveDefaultModel,
  resolveLanguageModel,
  resolveModelSelection,
} from "@/agent/stream/modelFactory"

const mockCreateOpenAI = vi
  .fn()
  .mockReturnValue({ chat: vi.fn().mockReturnValue({ id: "openai-model" }) })
const mockCreateAnthropic = vi
  .fn()
  .mockReturnValue({ chat: vi.fn().mockReturnValue({ id: "anthropic-model" }) })
const mockCreateGoogle = vi
  .fn()
  .mockReturnValue({ chat: vi.fn().mockReturnValue({ id: "google-model" }) })
const mockCreateOpenAICompatible = vi
  .fn()
  .mockReturnValue({ languageModel: vi.fn().mockReturnValue({ id: "compat-model" }) })
const mockExtractReasoningMiddleware = vi.fn().mockReturnValue({ name: "extract-reasoning" })
const mockWrapLanguageModel = vi.fn().mockImplementation(({ model }) => ({ wrapped: model }))

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: (options: unknown) => mockCreateOpenAI(options),
}))
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: (options: unknown) => mockCreateAnthropic(options),
}))
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: (options: unknown) => mockCreateGoogle(options),
}))
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: (options: unknown) => mockCreateOpenAICompatible(options),
}))
vi.mock("ai", () => ({
  extractReasoningMiddleware: (options: unknown) => mockExtractReasoningMiddleware(options),
  wrapLanguageModel: (options: unknown) => mockWrapLanguageModel(options),
}))

let mockSettings: ModelProviderSettings

vi.mock("@/services/settingsService", () => ({
  getModelProviderSettings: () => mockSettings,
}))

describe("modelFactory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateModelCache()
    mockSettings = {
      enabledProviders: ["openai-p", "anthropic-p", "compat-p", "minimax-anthropic"],
      providers: {
        "openai-p": {
          id: "openai-p",
          type: "openai",
          name: "OpenAI",
          options: { apiKey: "sk-openai", baseURL: "https://api.openai.com/v1" },
          models: { "gpt-4o": { id: "gpt-4o", name: "GPT-4o" } },
        },
        "anthropic-p": {
          id: "anthropic-p",
          type: "anthropic",
          name: "Anthropic",
          options: { apiKey: "sk-ant", baseURL: "https://api.anthropic.com/v1" },
          models: { "claude-3-5-sonnet": { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet" } },
        },
        "compat-p": {
          id: "compat-p",
          type: "openai-compatible",
          name: "OpenAI Compatible",
          options: { apiKey: "sk-compat", baseURL: "https://api.minimax.chat/v1" },
          models: { "MiniMax-Text-01": { id: "MiniMax-Text-01", name: "MiniMax Text 01" } },
        },
        "minimax-anthropic": {
          id: "minimax-anthropic",
          type: "anthropic",
          name: "MiniMax Anthropic",
          options: { apiKey: "sk-minimax", baseURL: "https://api.minimax.chat/anthropic/v1" },
          models: { "MiniMax-M3": { id: "MiniMax-M3", name: "MiniMax M3" } },
        },
      },
      defaultModel: { provider: "openai-p", model: "gpt-4o" },
      titleSummary: { provider: "openai-p", model: "gpt-4o" },
      suggestedQuestions: { provider: "openai-p", model: "gpt-4o" },
      suggestedQuestionsEnabled: true,
      compactionEnabled: true,
    }
  })

  afterEach(() => {
    invalidateModelCache()
  })

  it("通过 wrapLanguageModel 和 extractReasoningMiddleware 包装解析出的模型", () => {
    const resolved = resolveLanguageModel({ provider: "compat-p", id: "MiniMax-Text-01" })
    expect(mockExtractReasoningMiddleware).toHaveBeenCalledWith({ tagName: "think" })
    expect(mockWrapLanguageModel).toHaveBeenCalledWith({
      model: { id: "compat-model" },
      middleware: { name: "extract-reasoning" },
    })
    expect(resolved).toEqual({ wrapped: { id: "compat-model" } })
  })

  it("Anthropic 协议正确传递 baseURL 与 thinking beta 请求头", () => {
    resolveLanguageModel({ provider: "minimax-anthropic", id: "MiniMax-M3" })
    expect(mockCreateAnthropic).toHaveBeenCalledWith({
      apiKey: "sk-minimax",
      baseURL: "https://api.minimax.chat/anthropic/v1",
      headers: {
        "anthropic-beta": "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
      },
    })
  })

  it("OpenAI 协议正确传递 apiKey 与 baseURL", () => {
    resolveLanguageModel({ provider: "openai-p", id: "gpt-4o" })
    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-openai",
      baseURL: "https://api.openai.com/v1",
    })
  })

  it("缓存解析出的 LanguageModel 实例", () => {
    const first = resolveLanguageModel({ provider: "openai-p", id: "gpt-4o" })
    const second = resolveLanguageModel({ provider: "openai-p", id: "gpt-4o" })
    expect(first).toBe(second)
    expect(mockCreateOpenAI).toHaveBeenCalledTimes(1)

    invalidateModelCache()
    const third = resolveLanguageModel({ provider: "openai-p", id: "gpt-4o" })
    expect(mockCreateOpenAI).toHaveBeenCalledTimes(2)
  })

  it("Provider 缺失或 API Key 缺失时抛出错误", () => {
    expect(() => resolveLanguageModel({ provider: "unknown", id: "m" })).toThrow(
      "Provider not found",
    )

    mockSettings.providers["openai-p"].options.apiKey = ""
    expect(() => resolveLanguageModel({ provider: "openai-p", id: "gpt-4o" })).toThrow(
      "未配置 API Key",
    )
  })

  it("resolveDefaultModel 与 resolveModelSelection 解析正常", () => {
    expect(resolveDefaultModel()).toEqual({ model: { provider: "openai-p", id: "gpt-4o" } })
    expect(resolveModelSelection({ provider: "openai-p", model: "gpt-4o" })).toEqual({
      model: { provider: "openai-p", id: "gpt-4o" },
    })
    expect(resolveModelSelection({ provider: "unknown", model: "gpt-4o" })).toEqual({
      error: "模型 Provider unknown 未配置。请在设置中配置模型 Provider。",
    })
  })
})
