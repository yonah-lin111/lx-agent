// OpenCode Go 预设的跨进程共享常量（main 与 renderer 复用同一契约）。
// 来源：opencode-dev packages/web/src/content/docs/go.mdx Endpoints 表。
// 单 Provider 形态：协议差异由模型级 transport 覆盖承载（见 resolveModelTransport），
// provider 级 type 恒为 openai-compatible 且在设置页锁定不可改。

import type { ModelProviderModel, ModelTransportType } from "./settings"

// OpenCode Go 预设 Provider ID。
export const OPENCODE_GO_PROVIDER_ID = "opencode-go"

// OpenCode Go 统一接入地址；模型列表 GET {base}/v1/models。
export const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1"

// 订阅与取 key 的控制台地址。
export const OPENCODE_GO_CONSOLE_URL = "https://opencode.ai"

// 静态客户端标识（Go 要求客户端自报身份，而非通用 SDK 名称）。
export const OPENCODE_GO_CLIENT_ID = "lx-agent"

// models.dev 全量目录地址（云端更新时按需拉取，仅解析 opencode-go 一节）。
export const MODELS_DEV_CATALOG_URL = "https://models.dev/api.json"

// 内置 Provider ID 集合：读写分离到 builtinProviders 独立配置文件，不与用户自定义混存。
export const BUILTIN_PROVIDER_IDS = [OPENCODE_GO_PROVIDER_ID] as const

// 是否为内置 Provider。
export const isBuiltinProviderId = (id: string): boolean =>
  (BUILTIN_PROVIDER_IDS as readonly string[]).includes(id)

// 云端刷新结果。
export type RefreshOpencodeGoResult = {
  providerId: string
  // 本次新增的模型 id。
  added: string[]
  // 本次更新管理字段的模型 id。
  updated: string[]
}

// models.dev 目录中 opencode-go 一节的最小子集（云端更新载荷）。
export type ModelsDevGoCatalog = {
  npm: string
  providerName: string
  models: Record<string, ModelsDevGoModel>
}

// models.dev 模型条目的最小子集（云端更新映射用）。
export type ModelsDevGoModel = {
  id: string
  name?: string
  limit?: { context?: number; output?: number }
  modalities?: { input?: string[]; output?: string[] }
  cost?: { input?: number; output?: number; cache_read?: number; cache_write?: number }
  reasoning_options?: Array<{ type?: string; values?: unknown[]; max?: unknown }>
  provider?: { npm?: string }
}

// Anthropic 系预算档位的输出上限（移植自 opencode OUTPUT_TOKEN_MAX）。
const ANTHROPIC_BUDGET_OUTPUT_MAX = 32_000

// Responses 系三件套的加密推理透传值（移植自 opencode INCLUDE_ENCRYPTED_REASONING）。
const ENCRYPTED_REASONING_INCLUDE = ["reasoning.encrypted_content"] as const

/**
 * 映射 models.dev 的 per-model npm 到模型级 transport（移植自 opencode 的 apiNpm 覆盖语义，
 * 落到 lx-agent 的单 provider 结构上）：
 * - @ai-sdk/anthropic → anthropic；
 * - @ai-sdk/openai → openai-responses（Go 经 /responses 端点服务此类模型，见 go.mdx Endpoints 表）；
 * - 其余继承 provider.type。
 */
export const mapModelsDevTransport = (
  model: ModelsDevGoModel,
  providerNpm: string,
): ModelTransportType | undefined => {
  const npm = model.provider?.npm ?? providerNpm
  if (npm === "@ai-sdk/anthropic") return "anthropic"
  if (npm === "@ai-sdk/openai") return "openai-responses"
  return undefined
}

/**
 * 映射 models.dev 的 reasoning_options 到思考等级预设
 * （移植自 opencode reasoningVariants + 硬编码回退，见 provider/transform.ts）：
 * - effort → 各档位 { reasoningEffort }（openai 通路附摘要与加密透传）；
 * - toggle + budget_tokens → 仅 anthropic 通路按输出上限算 high/max 预算；
 * - toggle 且为 minimax-m3 → { none: 关闭, thinking: 自适应 }；
 * - 空数组 → 无可调档位，返回 undefined。
 */
export const mapModelsDevVariants = (
  model: ModelsDevGoModel,
  providerNpm: string,
  outputLimit: number,
): Record<string, Record<string, unknown>> | undefined => {
  const npm = model.provider?.npm ?? providerNpm
  const options = model.reasoning_options
  if (options === undefined) return undefined
  if (options.length === 0) return undefined

  const effortValues = options
    .find((option) => option?.type === "effort")
    ?.values?.filter((value): value is string => typeof value === "string")
  if (effortValues && effortValues.length > 0) {
    return Object.fromEntries(
      effortValues.map((effort) => [
        effort,
        npm === "@ai-sdk/openai"
          ? {
              reasoningEffort: effort,
              reasoningSummary: "auto",
              include: [...ENCRYPTED_REASONING_INCLUDE],
            }
          : { reasoningEffort: effort },
      ]),
    )
  }

  const budgetOption = options.find((option) => option?.type === "budget_tokens")
  if (npm === "@ai-sdk/anthropic" && budgetOption) {
    const maximum = Math.min(
      typeof budgetOption.max === "number" ? budgetOption.max : ANTHROPIC_BUDGET_OUTPUT_MAX - 1,
      outputLimit - 1,
      ANTHROPIC_BUDGET_OUTPUT_MAX - 1,
    )
    if (maximum <= 0) return undefined
    const high = Math.min(Math.floor((maximum + 1) / 2), maximum)
    return {
      high: { thinking: { type: "enabled", budgetTokens: high } },
      max: { thinking: { type: "enabled", budgetTokens: maximum } },
    }
  }

  if (npm === "@ai-sdk/anthropic" && model.id.includes("minimax-m3")) {
    return {
      none: { thinking: { type: "disabled" } },
      thinking: { thinking: { type: "adaptive" } },
    }
  }

  return undefined
}

/**
 * 映射 models.dev 模型条目到本地模型记录（managed 字段：transport/limit/modalities/variants；
 * 计价仅新模型填充，存量计价以本地 Go 账单价为准不覆盖）。
 */
export const mapModelsDevModel = (
  model: ModelsDevGoModel,
  providerNpm: string,
): ModelProviderModel => {
  const limit =
    typeof model.limit?.context === "number" && typeof model.limit?.output === "number"
      ? { context: model.limit.context, output: model.limit.output }
      : undefined
  const modalities =
    Array.isArray(model.modalities?.input) && Array.isArray(model.modalities?.output)
      ? { input: [...model.modalities.input], output: [...model.modalities.output] }
      : undefined
  const variants = mapModelsDevVariants(model, providerNpm, limit?.output ?? 0)
  const cost = model.cost
  const pricing =
    typeof cost?.input === "number" &&
    typeof cost?.output === "number" &&
    typeof cost?.cache_read === "number"
      ? {
          input: cost.input,
          output: cost.output,
          cacheRead: cost.cache_read,
          cacheWrite: typeof cost?.cache_write === "number" ? cost.cache_write : 0,
        }
      : undefined
  const transport = mapModelsDevTransport(model, providerNpm)
  return {
    id: model.id,
    name: model.name?.trim() || model.id,
    ...(transport ? { transport } : {}),
    ...(limit ? { limit } : {}),
    ...(modalities ? { modalities } : {}),
    ...(variants ? { variants } : {}),
    ...(pricing ? { pricing } : {}),
  }
}
