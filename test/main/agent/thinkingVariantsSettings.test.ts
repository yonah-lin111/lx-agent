import { describe, expect, it } from "vitest"
import { getModelProviderSettings, saveModelProviderSettings } from "@/services/settingsService"
import { resolveModelSelection } from "@/agent/stream/modelFactory"
import type { ModelProviderSettings } from "@shared/settings"

describe("Model Settings Thinking Variants", () => {
  it("规范化并保存/读取 variants 配置", () => {
    const input: ModelProviderSettings = {
      enabledProviders: ["test-provider"],
      providers: {
        "test-provider": {
          id: "test-provider",
          name: "Test Provider",
          type: "openai-compatible",
          options: { apiKey: "key", baseURL: "http://localhost" },
          models: {
            "test-model": {
              id: "test-model",
              name: "Test Model",
              variants: {
                low: { reasoningEffort: "low" },
                high: { reasoningEffort: "high", customField: 123 },
              },
              variant: "high",
            },
          },
        },
      },
      defaultModel: { provider: "test-provider", model: "test-model", variant: "high" },
      titleSummary: { provider: "test-provider", model: "test-model" },
      suggestedQuestions: { provider: "test-provider", model: "test-model" },
      suggestedQuestionsEnabled: true,
      compactionEnabled: true,
    }

    const saved = saveModelProviderSettings(input)
    expect(saved.providers["test-provider"].models["test-model"].variants).toEqual({
      low: { reasoningEffort: "low" },
      high: { reasoningEffort: "high", customField: 123 },
    })
    expect(saved.providers["test-provider"].models["test-model"].variant).toBe("high")
    expect(saved.defaultModel.variant).toBe("high")

    const resolved = resolveModelSelection({
      provider: "test-provider",
      model: "test-model",
      variant: "low",
    })
    expect(resolved).toEqual({
      model: {
        provider: "test-provider",
        id: "test-model",
        variant: "low",
      },
    })
  })
})
