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

  it("新模型关键词回退：claude-sonnet-4/opus-4/haiku-4、gpt-5、gpt-4.1、o3/o4 判定为视觉模型", () => {
    const newVisionModels = [
      "claude-sonnet-4-20250514",
      "claude-opus-4-1",
      "claude-haiku-4-5",
      "gpt-5.2-codex",
      "gpt-4.1-mini",
      "o3",
      "o3-mini",
      "o4-mini",
    ]
    mocks.getModelProviderSettings.mockReturnValue(
      settingsWith(Object.fromEntries(newVisionModels.map((id) => [id, {}]))),
    )
    for (const id of newVisionModels) {
      expect(modelSupportsImageInput("openai", id), id).toBe(true)
    }
  })

  it("短关键词（o3/o4）按 token 边界匹配，不误伤本地模型名", () => {
    const nonVisionModels = ["my-local-o3x", "foo3", "o4spark", "llama-3.1-70b", "deepseek-chat"]
    mocks.getModelProviderSettings.mockReturnValue(
      settingsWith(Object.fromEntries(nonVisionModels.map((id) => [id, {}]))),
    )
    for (const id of nonVisionModels) {
      expect(modelSupportsImageInput("openai", id), id).toBe(false)
    }
  })

  it("Provider 或模型缺失时走关键词回退（不抛错）", () => {
    mocks.getModelProviderSettings.mockReturnValue(settingsWith({}))
    expect(modelSupportsImageInput("missing", "gpt-4o")).toBe(true)
    expect(modelSupportsImageInput("missing", "unknown-model")).toBe(false)
  })
})
