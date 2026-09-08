import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ModelProviderSettings } from "@shared/settings"

const holder = vi.hoisted(() => ({
  configPath: "",
}))

vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return {
    ...actual,
    getConfigPath: () => holder.configPath,
  }
})

describe("Model Settings Thinking Variants", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "variants-test-"))
    holder.configPath = join(tmpDir, "config.json")
    writeFileSync(holder.configPath, JSON.stringify({}))
  })

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("规范化并保存/读取 variants 配置", async () => {
    const { getModelProviderSettings, saveModelProviderSettings } = await import(
      "@/services/settingsService"
    )
    const { resolveModelSelection } = await import("@/agent/stream/modelFactory")

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
