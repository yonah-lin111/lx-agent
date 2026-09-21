import {
  type ModelsDevGoModel,
  mapModelsDevModel,
  mapModelsDevTransport,
  mapModelsDevVariants,
} from "@shared/opencodeGo"
import { describe, expect, it } from "vitest"

const model = (partial: Partial<ModelsDevGoModel>): ModelsDevGoModel => ({
  id: "m",
  ...partial,
})

describe("mapModelsDevTransport", () => {
  it("anthropic 覆盖走 anthropic，openai 覆盖走 responses，其余继承", () => {
    expect(
      mapModelsDevTransport(model({ id: "a", provider: { npm: "@ai-sdk/anthropic" } }), "compat"),
    ).toBe("anthropic")
    expect(
      mapModelsDevTransport(model({ id: "b", provider: { npm: "@ai-sdk/openai" } }), "compat"),
    ).toBe("openai-responses")
    expect(mapModelsDevTransport(model({ id: "c" }), "@ai-sdk/openai-compatible")).toBeUndefined()
    // provider 级 npm 作为默认值（与 opencode 的 apiNpm 回退链一致）。
    expect(mapModelsDevTransport(model({ id: "d" }), "@ai-sdk/anthropic")).toBe("anthropic")
  })
})

describe("mapModelsDevVariants", () => {
  it("effort 档位映射为 reasoningEffort", () => {
    expect(
      mapModelsDevVariants(
        model({
          id: "ds",
          reasoning_options: [{ type: "effort", values: ["low", "high", "max"] }],
        }),
        "@ai-sdk/openai-compatible",
        384000,
      ),
    ).toEqual({
      low: { reasoningEffort: "low" },
      high: { reasoningEffort: "high" },
      max: { reasoningEffort: "max" },
    })
  })

  it("openai 通路附摘要与加密透传", () => {
    expect(
      mapModelsDevVariants(
        model({ id: "g", reasoning_options: [{ type: "effort", values: ["high"] }] }),
        "@ai-sdk/openai",
        500000,
      ),
    ).toEqual({
      high: {
        reasoningEffort: "high",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    })
  })

  it("空 reasoning_options 表示无可调档位", () => {
    expect(
      mapModelsDevVariants(model({ id: "k", reasoning_options: [] }), "compat", 100),
    ).toBeUndefined()
    expect(mapModelsDevVariants(model({ id: "u" }), "compat", 100)).toBeUndefined()
  })

  it("toggle 仅 minimax-m3 在 anthropic 通路有开关", () => {
    expect(
      mapModelsDevVariants(
        model({ id: "minimax-m3", reasoning_options: [{ type: "toggle" }] }),
        "@ai-sdk/anthropic",
        131072,
      ),
    ).toEqual({
      none: { thinking: { type: "disabled" } },
      thinking: { thinking: { type: "adaptive" } },
    })
    expect(
      mapModelsDevVariants(
        model({ id: "longcat-2.0", reasoning_options: [{ type: "toggle" }] }),
        "@ai-sdk/openai-compatible",
        131072,
      ),
    ).toBeUndefined()
  })

  it("anthropic 通路按输出上限算 high/max 预算", () => {
    expect(
      mapModelsDevVariants(
        model({
          id: "q",
          reasoning_options: [{ type: "toggle" }, { type: "budget_tokens", max: 262144 }],
        }),
        "@ai-sdk/anthropic",
        65536,
      ),
    ).toEqual({
      high: { thinking: { type: "enabled", budgetTokens: 16000 } },
      max: { thinking: { type: "enabled", budgetTokens: 31999 } },
    })
  })

  it("compatible 通路的 budget 无映射", () => {
    expect(
      mapModelsDevVariants(
        model({
          id: "q",
          reasoning_options: [{ type: "toggle" }, { type: "budget_tokens", max: 81920 }],
        }),
        "@ai-sdk/openai-compatible",
        65536,
      ),
    ).toBeUndefined()
  })
})

describe("mapModelsDevModel", () => {
  it("组装完整模型记录", () => {
    expect(
      mapModelsDevModel(
        model({
          id: "ds",
          name: "DeepSeek V4 Flash",
          limit: { context: 1000000, output: 384000 },
          modalities: { input: ["text"], output: ["text"] },
          cost: { input: 0.14, output: 0.28, cache_read: 0.0028 },
          reasoning_options: [{ type: "effort", values: ["high"] }],
        }),
        "@ai-sdk/openai-compatible",
      ),
    ).toEqual({
      id: "ds",
      name: "DeepSeek V4 Flash",
      limit: { context: 1000000, output: 384000 },
      modalities: { input: ["text"], output: ["text"] },
      variants: { high: { reasoningEffort: "high" } },
      pricing: { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
    })
  })

  it("缺失元数据时仅保留 id 与回退名", () => {
    expect(mapModelsDevModel(model({ id: "x" }), "@ai-sdk/openai-compatible")).toEqual({
      id: "x",
      name: "x",
    })
  })
})
