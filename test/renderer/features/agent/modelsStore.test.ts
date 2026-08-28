import type { ModelProviderSettings } from "@shared/settings"
import { describe, expect, it } from "vitest"
import { getModelDisplayName } from "@/features/agent/hooks/modelsStore"

describe("modelsStore - getModelDisplayName", () => {
  const mockSettings: ModelProviderSettings = {
    enabledProviders: ["openai", "anthropic"],
    providers: {
      openai: {
        id: "openai",
        type: "openai",
        name: "OpenAI",
        options: { apiKey: "", baseURL: "" },
        models: {
          "gpt-4o": { id: "gpt-4o", name: "GPT-4o (Omni)" },
          "gpt-4o-mini": { id: "gpt-4o-mini", name: "GPT-4o Mini" },
        },
      },
      anthropic: {
        id: "anthropic",
        type: "anthropic",
        name: "Anthropic",
        options: { apiKey: "", baseURL: "" },
        models: {
          "claude-3-5-sonnet-20241022": {
            id: "claude-3-5-sonnet-20241022",
            name: "Claude 3.5 Sonnet",
          },
        },
      },
      disabledProvider: {
        id: "disabledProvider",
        type: "openai-compatible",
        name: "Disabled Custom",
        options: { apiKey: "", baseURL: "" },
        models: {
          "custom-model": { id: "custom-model", name: "Custom Model Display" },
        },
      },
    },
    defaultModel: { provider: "openai", model: "gpt-4o" },
    titleSummary: { provider: "openai", model: "gpt-4o-mini" },
    suggestedQuestions: { provider: "openai", model: "gpt-4o-mini" },
    suggestedQuestionsEnabled: true,
    compactionEnabled: true,
  }

  it("当 modelId 为空或未定义时返回空字符串", () => {
    expect(getModelDisplayName(undefined, undefined, mockSettings)).toBe("")
    expect(getModelDisplayName("", undefined, mockSettings)).toBe("")
  })

  it("当 settings 为 null 时直接返回原 modelId", () => {
    expect(getModelDisplayName("gpt-4o", "openai", null)).toBe("gpt-4o")
  })

  it("精确匹配 providerId 时返回对应模型的显示名称", () => {
    expect(getModelDisplayName("gpt-4o", "openai", mockSettings)).toBe("GPT-4o (Omni)")
    expect(getModelDisplayName("claude-3-5-sonnet-20241022", "anthropic", mockSettings)).toBe(
      "Claude 3.5 Sonnet",
    )
  })

  it("未传 providerId 时能在 enabledProviders 中查找到显示名称", () => {
    expect(getModelDisplayName("gpt-4o", undefined, mockSettings)).toBe("GPT-4o (Omni)")
    expect(getModelDisplayName("claude-3-5-sonnet-20241022", undefined, mockSettings)).toBe(
      "Claude 3.5 Sonnet",
    )
  })

  it("能在未启用的 provider 中查找模型名称作为兜底", () => {
    expect(getModelDisplayName("custom-model", undefined, mockSettings)).toBe(
      "Custom Model Display",
    )
  })

  it("未匹配到任何模型配置时优雅回退为原 modelId", () => {
    expect(getModelDisplayName("unknown-future-model", undefined, mockSettings)).toBe(
      "unknown-future-model",
    )
  })
})
