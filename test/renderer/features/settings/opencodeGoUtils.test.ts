import { OPENCODE_GO_BASE_URL, OPENCODE_GO_PROVIDER_ID } from "@shared/opencodeGo"
import { describe, expect, it } from "vitest"
import { OPENCODE_GO_PRESET } from "@/features/settings/components/ModelProviderSettings/constants"
import {
  applyOpencodeGoPreset,
  findOpencodeGoKey,
  isOpencodeGoMissing,
} from "@/features/settings/components/ModelProviderSettings/utils"
import type { ModelProvider } from "@/features/settings/types"

// 最小 Provider 构造器。
const provider = (id: string, name?: string): ModelProvider => ({
  id,
  type: "openai-compatible",
  name: name ?? id,
  options: { apiKey: "", baseURL: "" },
  models: {},
})

describe("OpenCode Go 单预设常量", () => {
  it("预设 id/type/baseURL 锁定", () => {
    expect(OPENCODE_GO_PRESET.id).toBe(OPENCODE_GO_PROVIDER_ID)
    expect(OPENCODE_GO_PRESET.id).toBe("opencode-go")
    expect(OPENCODE_GO_PRESET.type).toBe("openai-compatible")
    expect(OPENCODE_GO_BASE_URL).toBe("https://opencode.ai/zen/go/v1")
  })

  it("28 个模型且 id 唯一", () => {
    expect(OPENCODE_GO_PRESET.models).toHaveLength(28)
    const ids = OPENCODE_GO_PRESET.models.map((model) => model.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("模型 id 与展示名一一对齐（防错位回归）", () => {
    expect(OPENCODE_GO_PRESET.models.map((model) => [model.id, model.name])).toEqual([
      ["glm-5.3-flash", "GLM-5.3-Flash"],
      ["glm-5.3", "GLM-5.3"],
      ["glm-5.2", "GLM-5.2"],
      ["glm-5.1", "GLM-5.1"],
      ["kimi-k3", "Kimi K3"],
      ["kimi-k2.7-code", "Kimi K2.7 Code"],
      ["kimi-k2.6", "Kimi K2.6"],
      ["longcat-2.0", "LongCat-2.0"],
      ["deepseek-v4.1-flash", "DeepSeek V4.1 Flash"],
      ["deepseek-v4-pro", "DeepSeek V4 Pro"],
      ["deepseek-v4-flash", "DeepSeek V4 Flash"],
      ["deepseek-v4-flash-vision-exp", "DeepSeek V4 Flash Vision Exp"],
      ["mimo-v2.5", "MiMo-V2.5"],
      ["mimo-v2.5-pro", "MiMo-V2.5-Pro"],
      ["hy4-preview", "Hy4 preview"],
      ["hy3", "Hy3"],
      ["minimax-m3", "MiniMax M3"],
      ["minimax-m2.7", "MiniMax M2.7"],
      ["minimax-m2.5", "MiniMax-M2.5"],
      ["qwen3.8-max", "Qwen3.8 Max"],
      ["qwen3.8-flash", "Qwen3.8 Flash"],
      ["qwen3.7-max", "Qwen3.7 Max"],
      ["qwen3.7-plus", "Qwen3.7 Plus"],
      ["qwen3.6-plus", "Qwen3.6 Plus"],
      ["grok-4.6", "Grok 4.6"],
      ["gpt-5.6-luna", "GPT 5.6 Luna"],
      ["muse-spark-1.3-contributor", "Muse Spark 1.3 Contributor"],
      ["muse-spark-1.2-contributor", "Muse Spark 1.2 Contributor"],
    ])
  })

  it("协议覆盖分布：20 继承 + 4 anthropic + 4 responses", () => {
    const byTransport = (transport: string | undefined): string[] =>
      OPENCODE_GO_PRESET.models
        .filter((model) => model.transport === transport)
        .map((model) => model.id)
    expect(byTransport(undefined)).toHaveLength(20)
    expect(byTransport("anthropic")).toEqual([
      "minimax-m3",
      "minimax-m2.7",
      "minimax-m2.5",
      "qwen3.8-flash",
    ])
    expect(byTransport("openai-responses")).toEqual([
      "grok-4.6",
      "gpt-5.6-luna",
      "muse-spark-1.3-contributor",
      "muse-spark-1.2-contributor",
    ])
    // Qwen（除 3.8-flash）走默认 compatible 通路，与运行时 models.dev 一致。
    for (const id of ["qwen3.8-max", "qwen3.7-max", "qwen3.7-plus", "qwen3.6-plus"]) {
      expect(byTransport(undefined)).toContain(id)
    }
  })

  it("全部模型均带计价", () => {
    for (const model of OPENCODE_GO_PRESET.models) {
      expect(model.pricing?.input ?? -1).toBeGreaterThanOrEqual(0)
      expect(model.pricing?.output ?? -1).toBeGreaterThanOrEqual(0)
    }
  })

  it("思考等级预设逐字映射 opencode（含档位集合与参数形状）", () => {
    const byId = Object.fromEntries(OPENCODE_GO_PRESET.models.map((model) => [model.id, model]))
    // effort 系：档位集合取自各模型的 reasoning_options。
    expect(byId["glm-5.2"].variants).toEqual({
      high: { reasoningEffort: "high" },
      max: { reasoningEffort: "max" },
    })
    expect(byId["glm-5.3"].variants).toEqual({
      low: { reasoningEffort: "low" },
      high: { reasoningEffort: "high" },
      max: { reasoningEffort: "max" },
    })
    expect(byId["deepseek-v4-flash"].variants).toEqual({
      low: { reasoningEffort: "low" },
      high: { reasoningEffort: "high" },
      max: { reasoningEffort: "max" },
    })
    expect(byId["kimi-k3"].variants).toEqual({ max: { reasoningEffort: "max" } })
    expect(byId["longcat-2.0"].variants).toEqual({
      low: { reasoningEffort: "low" },
      medium: { reasoningEffort: "medium" },
      high: { reasoningEffort: "high" },
    })
    expect(byId["hy3"].variants).toEqual({
      none: { reasoningEffort: "none" },
      low: { reasoningEffort: "low" },
      high: { reasoningEffort: "high" },
    })
    // minimax-m3：关闭/自适应开关。
    expect(byId["minimax-m3"].variants).toEqual({
      none: { thinking: { type: "disabled" } },
      thinking: { thinking: { type: "adaptive" } },
    })
    // qwen3.8-flash：anthropic 通路裸 effort 键。
    expect(byId["qwen3.8-flash"].variants).toEqual({
      low: { effort: "low" },
      medium: { effort: "medium" },
      xhigh: { effort: "xhigh" },
    })
    // responses 系：档位 + 摘要 + 加密推理透传三件套。
    const encrypted = ["reasoning.encrypted_content"]
    expect(byId["grok-4.6"].variants).toEqual({
      low: { reasoningEffort: "low", reasoningSummary: "auto", include: encrypted },
      medium: { reasoningEffort: "medium", reasoningSummary: "auto", include: encrypted },
      high: { reasoningEffort: "high", reasoningSummary: "auto", include: encrypted },
      xhigh: { reasoningEffort: "xhigh", reasoningSummary: "auto", include: encrypted },
    })
    expect(Object.keys(byId["gpt-5.6-luna"].variants ?? {})).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ])
    expect(Object.keys(byId["muse-spark-1.3-contributor"].variants ?? {})).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ])
    // 上游无可调档位的模型不带预设（与 opencode 一致，推理自动生效）。
    for (const id of [
      "glm-5.1",
      "kimi-k2.7-code",
      "kimi-k2.6",
      "mimo-v2.5",
      "mimo-v2.5-pro",
      "minimax-m2.7",
      "minimax-m2.5",
      "qwen3.8-max",
      "qwen3.7-max",
      "qwen3.7-plus",
      "qwen3.6-plus",
    ]) {
      expect(byId[id].variants).toBeUndefined()
    }
    // 均不设默认选中，与 opencode 未选档位的开箱行为一致。
    for (const model of OPENCODE_GO_PRESET.models) {
      expect(model.variant).toBeUndefined()
    }
  })
})

describe("OpenCode Go 预设工具函数", () => {
  it("按记录 key 或 provider.id 判定存在", () => {
    expect(findOpencodeGoKey({})).toBeUndefined()
    expect(findOpencodeGoKey({ "opencode-go": provider("opencode-go") })).toBe("opencode-go")
    // Provider ID 改名前的中间态：记录 key 已变但 provider.id 仍命中。
    expect(findOpencodeGoKey({ custom: provider("opencode-go") })).toBe("custom")
    expect(isOpencodeGoMissing({})).toBe(true)
    expect(isOpencodeGoMissing({ "opencode-go": provider("opencode-go") })).toBe(false)
  })

  it("一键创建：空配置建成单个预设并自动启用", () => {
    const next = applyOpencodeGoPreset({}, [])
    expect(next.added).toBe(true)
    expect(Object.keys(next.providers)).toEqual(["opencode-go"])
    expect(next.enabledProviders).toEqual(["opencode-go"])
    const created = next.providers["opencode-go"]
    expect(created.type).toBe("openai-compatible")
    expect(created.options.baseURL).toBe(OPENCODE_GO_BASE_URL)
    expect(created.options.apiKey).toBe("")
    expect(Object.keys(created.models)).toHaveLength(28)
    expect(created.models["minimax-m3"].transport).toBe("anthropic")
    expect(created.models["grok-4.6"].transport).toBe("openai-responses")
    expect(created.models["kimi-k2.7-code"].transport).toBeUndefined()
  })

  it("幂等：已存在时跳过不覆盖", () => {
    const existing = { "opencode-go": provider("opencode-go", "My Go") }
    const next = applyOpencodeGoPreset(existing, ["opencode-go"])
    expect(next.added).toBe(false)
    expect(next.providers).toBe(existing)
    expect(next.providers["opencode-go"].name).toBe("My Go")
  })

  it("新建预设与常量深隔离：修改结果不污染预设表", () => {
    const next = applyOpencodeGoPreset({}, [])
    next.providers["opencode-go"].models["glm-5.2"].name = "HACKED"
    expect(OPENCODE_GO_PRESET.models.find((model) => model.id === "glm-5.2")?.name).toBe("GLM-5.2")
    const variants = next.providers["opencode-go"].models["deepseek-v4-flash"].variants
    expect(variants).toBeDefined()
    if (variants) variants["high"] = { reasoningEffort: "hacked" }
    expect(
      OPENCODE_GO_PRESET.models.find((model) => model.id === "deepseek-v4-flash")?.variants,
    ).toEqual({
      low: { reasoningEffort: "low" },
      high: { reasoningEffort: "high" },
      max: { reasoningEffort: "max" },
    })
  })
})
