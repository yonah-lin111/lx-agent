import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getModelProviderSettings: vi.fn(),
}))

vi.mock("@/services/settingsService", () => ({
  getModelProviderSettings: mocks.getModelProviderSettings,
}))

import { modelSupportsImageInput } from "@/agent/stream/modelCapabilities"

// 构造 Provider 设置骨架（仅含被测字段）。
const settingsWith = (
  models: Record<string, { modalities?: { input: string[]; output: string[] } }>,
): { providers: Record<string, unknown> } => ({
  providers: { openai: { models } },
})

describe("modelSupportsImageInput", () => {
  beforeEach(() => {
    mocks.getModelProviderSettings.mockReset()
  })

  it("modalities.input 含 image 时返回 true", () => {
    mocks.getModelProviderSettings.mockReturnValue(
      settingsWith({ "gpt-x": { modalities: { input: ["text", "image"], output: ["text"] } } }),
    )
    expect(modelSupportsImageInput("openai", "gpt-x")).toBe(true)
  })

  it("modalities.input 不含 image 时返回 false（即使模型名含关键词）", () => {
    mocks.getModelProviderSettings.mockReturnValue(
      settingsWith({ "gpt-4o": { modalities: { input: ["text"], output: ["text"] } } }),
    )
    expect(modelSupportsImageInput("openai", "gpt-4o")).toBe(false)
  })

  it("无 modalities 配置时回退关键词启发式", () => {
    mocks.getModelProviderSettings.mockReturnValue(
      settingsWith({
        "gpt-4o-mini": {},
        "claude-3-5-sonnet": {},
        "gemini-2.0": {},
        "my-local": {},
      }),
    )
    expect(modelSupportsImageInput("openai", "gpt-4o-mini")).toBe(true)
    expect(modelSupportsImageInput("openai", "claude-3-5-sonnet")).toBe(true)
    expect(modelSupportsImageInput("openai", "gemini-2.0")).toBe(true)
    expect(modelSupportsImageInput("openai", "my-local")).toBe(false)
  })

  it("Provider 或模型缺失时走关键词回退（不抛错）", () => {
    mocks.getModelProviderSettings.mockReturnValue(settingsWith({}))
    expect(modelSupportsImageInput("missing", "gpt-4o")).toBe(true)
    expect(modelSupportsImageInput("missing", "unknown-model")).toBe(false)
  })
})
