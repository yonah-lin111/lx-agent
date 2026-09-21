import { OPENCODE_GO_BASE_URL, OPENCODE_GO_PROVIDER_ID } from "@shared/opencodeGo"
import type { ModelProvider, ModelProviderModel } from "@/features/settings/types"

export const PROVIDER_TYPES: ModelProvider["type"][] = [
  "openai-compatible",
  "openai",
  "anthropic",
  "google",
]

// 预设模型条目：id + 展示名 + 传输覆盖/计价/限制/模态/思考等级。
// transport 缺省继承 Provider 的 type（openai-compatible），仅协议不同的模型显式覆盖，
// 与 opencode 按模型覆盖 provider.npm 的做法同构。
type OpencodeGoPresetModel = Pick<ModelProviderModel, "id" | "name"> &
  Partial<
    Pick<
      ModelProviderModel,
      "transport" | "limit" | "modalities" | "pricing" | "variants" | "variant"
    >
  >

// 文本输入输出模型的默认模态。
const textModalities = { input: ["text"], output: ["text"] }

// 思考等级预设（逐字映射 opencode 的 reasoningVariants + 硬编码回退，见 provider/transform.ts）：
// - effort 系：{档位: { reasoningEffort }}，档位集合取自各模型的 reasoning_options（含 none/max/minimal 等 非标值）。
// - responses 系（openai 通路）：每档附 reasoningSummary + include，与 opencode 一致。
// - minimax-m3（anthropic）：{ none: 关闭, thinking: 自适应 }。
// - qwen3.8-flash（anthropic）：裸 effort 键（opencode 对非 Claude 的 anthropic 通路即如此）。
// 上游无可调档位的模型（reasoning_options 为空）不带 variants，与 opencode 一致；
// 均不设默认选中（variant 缺省），与 opencode 未选档位的开箱行为一致。
const effortVariants = (...efforts: string[]): Record<string, Record<string, unknown>> =>
  Object.fromEntries(efforts.map((effort) => [effort, { reasoningEffort: effort }]))

const responsesVariants = (...efforts: string[]): Record<string, Record<string, unknown>> =>
  Object.fromEntries(
    efforts.map((effort) => [
      effort,
      {
        reasoningEffort: effort,
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    ]),
  )

// OpenCode Go 单预设：28 个模型（计价为 Go 价目表基础档 USD/百万 token；limit/modalities 取自 models.dev）。
export const OPENCODE_GO_PRESET: {
  id: string
  name: string
  type: ModelProvider["type"]
  models: OpencodeGoPresetModel[]
} = {
  id: OPENCODE_GO_PROVIDER_ID,
  name: "OpenCode Go",
  type: "openai-compatible",
  models: [
    {
      id: "glm-5.3-flash",
      name: "GLM-5.3-Flash",
      limit: { context: 1000000, output: 131072 },
      modalities: { input: ["text", "image", "video", "pdf"], output: ["text"] },
      variants: effortVariants("low", "high", "max"),
      pricing: { input: 0.15, output: 0.5, cacheRead: 0.03, cacheWrite: 0 },
    },
    {
      id: "glm-5.3",
      name: "GLM-5.3",
      limit: { context: 1000000, output: 131072 },
      modalities: textModalities,
      variants: effortVariants("low", "high", "max"),
      pricing: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
    },
    {
      id: "glm-5.2",
      name: "GLM-5.2",
      limit: { context: 1000000, output: 131072 },
      modalities: textModalities,
      variants: effortVariants("high", "max"),
      pricing: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
    },
    {
      id: "glm-5.1",
      name: "GLM-5.1",
      limit: { context: 202752, output: 32768 },
      modalities: textModalities,
      pricing: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
    },
    {
      id: "kimi-k3",
      name: "Kimi K3",
      limit: { context: 1048576, output: 131072 },
      modalities: { input: ["text", "image", "video"], output: ["text"] },
      variants: effortVariants("max"),
      pricing: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 0 },
    },
    {
      id: "kimi-k2.7-code",
      name: "Kimi K2.7 Code",
      limit: { context: 262144, output: 262144 },
      modalities: { input: ["text", "image", "video"], output: ["text"] },
      pricing: { input: 0.95, output: 4, cacheRead: 0.19, cacheWrite: 0 },
    },
    {
      id: "kimi-k2.6",
      name: "Kimi K2.6",
      limit: { context: 262144, output: 65536 },
      modalities: { input: ["text", "image", "video"], output: ["text"] },
      pricing: { input: 0.95, output: 4, cacheRead: 0.16, cacheWrite: 0 },
    },
    {
      id: "longcat-2.0",
      name: "LongCat-2.0",
      limit: { context: 1000000, output: 131072 },
      modalities: textModalities,
      variants: effortVariants("low", "medium", "high"),
      pricing: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 },
    },
    {
      id: "deepseek-v4.1-flash",
      name: "DeepSeek V4.1 Flash",
      limit: { context: 1000000, output: 384000 },
      modalities: { input: ["text", "image"], output: ["text"] },
      variants: effortVariants("low", "high", "max"),
      pricing: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 },
    },
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      limit: { context: 1000000, output: 384000 },
      modalities: textModalities,
      variants: effortVariants("high", "max"),
      pricing: { input: 1.32, output: 3.96, cacheRead: 0.044, cacheWrite: 0 },
    },
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      limit: { context: 1000000, output: 384000 },
      modalities: textModalities,
      variants: effortVariants("low", "high", "max"),
      pricing: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 },
    },
    {
      id: "deepseek-v4-flash-vision-exp",
      name: "DeepSeek V4 Flash Vision Exp",
      limit: { context: 1000000, output: 384000 },
      modalities: { input: ["text", "image"], output: ["text"] },
      variants: effortVariants("low", "high", "max"),
      pricing: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 },
    },
    {
      id: "mimo-v2.5",
      name: "MiMo-V2.5",
      limit: { context: 1000000, output: 128000 },
      modalities: { input: ["text", "image", "audio", "video"], output: ["text"] },
      pricing: { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
    },
    {
      id: "mimo-v2.5-pro",
      name: "MiMo-V2.5-Pro",
      limit: { context: 1048576, output: 128000 },
      modalities: textModalities,
      pricing: { input: 0.435, output: 0.87, cacheRead: 0.003625, cacheWrite: 0 },
    },
    {
      id: "hy4-preview",
      name: "Hy4 preview",
      limit: { context: 1024000, output: 64000 },
      modalities: textModalities,
      variants: effortVariants("none", "high"),
      pricing: { input: 0.834, output: 2.501, cacheRead: 0.042, cacheWrite: 0 },
    },
    {
      id: "hy3",
      name: "Hy3",
      limit: { context: 256000, output: 128000 },
      modalities: textModalities,
      variants: effortVariants("none", "low", "high"),
      pricing: { input: 0.14, output: 0.58, cacheRead: 0.035, cacheWrite: 0 },
    },
    {
      id: "minimax-m3",
      name: "MiniMax M3",
      transport: "anthropic",
      limit: { context: 1000000, output: 131072 },
      modalities: { input: ["text", "image", "video"], output: ["text"] },
      variants: {
        none: { thinking: { type: "disabled" } },
        thinking: { thinking: { type: "adaptive" } },
      },
      pricing: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
    },
    {
      id: "minimax-m2.7",
      name: "MiniMax M2.7",
      transport: "anthropic",
      limit: { context: 204800, output: 131072 },
      modalities: textModalities,
      pricing: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0.375 },
    },
    {
      id: "minimax-m2.5",
      name: "MiniMax-M2.5",
      transport: "anthropic",
      limit: { context: 204800, output: 65536 },
      modalities: textModalities,
      pricing: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0.375 },
    },
    {
      id: "qwen3.8-max",
      name: "Qwen3.8 Max",
      limit: { context: 1000000, output: 131072 },
      modalities: { input: ["text", "image", "video"], output: ["text"] },
      pricing: { input: 2, output: 6, cacheRead: 0.25, cacheWrite: 2.5 },
    },
    {
      id: "qwen3.8-flash",
      name: "Qwen3.8 Flash",
      transport: "anthropic",
      limit: { context: 1000000, output: 131072 },
      modalities: { input: ["text", "image", "video"], output: ["text"] },
      variants: {
        low: { effort: "low" },
        medium: { effort: "medium" },
        xhigh: { effort: "xhigh" },
      },
      pricing: { input: 0.15, output: 0.47, cacheRead: 0.016, cacheWrite: 0.2 },
    },
    {
      id: "qwen3.7-max",
      name: "Qwen3.7 Max",
      limit: { context: 1000000, output: 65536 },
      modalities: textModalities,
      pricing: { input: 2.5, output: 7.5, cacheRead: 0.5, cacheWrite: 3.125 },
    },
    {
      id: "qwen3.7-plus",
      name: "Qwen3.7 Plus",
      limit: { context: 1000000, output: 65536 },
      modalities: { input: ["text", "image", "video"], output: ["text"] },
      pricing: { input: 0.4, output: 1.6, cacheRead: 0.04, cacheWrite: 0.5 },
    },
    {
      id: "qwen3.6-plus",
      name: "Qwen3.6 Plus",
      limit: { context: 1000000, output: 65536 },
      modalities: { input: ["text", "image", "video"], output: ["text"] },
      pricing: { input: 0.5, output: 3, cacheRead: 0.05, cacheWrite: 0.625 },
    },
    {
      id: "grok-4.6",
      name: "Grok 4.6",
      transport: "openai-responses",
      limit: { context: 500000, output: 500000 },
      modalities: { input: ["text", "image"], output: ["text"] },
      variants: responsesVariants("low", "medium", "high", "xhigh"),
      pricing: { input: 2, output: 6, cacheRead: 0.5, cacheWrite: 0 },
    },
    {
      id: "gpt-5.6-luna",
      name: "GPT 5.6 Luna",
      transport: "openai-responses",
      limit: { context: 1050000, output: 128000 },
      modalities: { input: ["text", "image", "pdf"], output: ["text"] },
      variants: responsesVariants("none", "low", "medium", "high", "xhigh", "max"),
      pricing: { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25 },
    },
    {
      id: "muse-spark-1.3-contributor",
      name: "Muse Spark 1.3 Contributor",
      transport: "openai-responses",
      limit: { context: 1048576, output: 131072 },
      modalities: { input: ["text", "image", "video", "pdf", "audio"], output: ["text"] },
      variants: responsesVariants("minimal", "low", "medium", "high", "xhigh"),
      pricing: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0 },
    },
    {
      id: "muse-spark-1.2-contributor",
      name: "Muse Spark 1.2 Contributor",
      transport: "openai-responses",
      limit: { context: 1048576, output: 131072 },
      modalities: { input: ["text", "image", "video", "pdf", "audio"], output: ["text"] },
      variants: responsesVariants("minimal", "low", "medium", "high", "xhigh"),
      pricing: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0 },
    },
  ],
}

// 预设 baseURL。
export const OPENCODE_GO_PRESET_BASE_URL = OPENCODE_GO_BASE_URL
