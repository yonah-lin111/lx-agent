import {
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  type ModelProvider,
  type ModelProviderModel,
  type ModelProviderSettings,
  type ModelSelection,
  type ProviderTransportType,
} from "@shared/settings"
import { getConfigPath } from "@/paths"
import { getCompactionSettings } from "./compaction"

import {
  clampNonNegativeInt,
  isRecord,
  type RawAiConfig,
  type RawProvider,
  readRawConfig,
  updateRawConfig,
} from "./rawConfig"

/**
 * 根据兼容配置中的 npm 包名推断 Provider 传输格式。
 */
const inferProviderType = (provider: RawProvider): ProviderTransportType => {
  if (provider.type) return provider.type
  if (provider.npm === "@ai-sdk/google") return "google"
  if (provider.npm === "@ai-sdk/anthropic") return "anthropic"
  if (provider.npm === "@ai-sdk/openai") return "openai"
  return "openai-compatible"
}

/**
 * 规范化单个模型配置。
 */
const normalizeModel = (
  id: string,
  model: Partial<ModelProviderModel> | undefined,
): ModelProviderModel => {
  const variants = normalizeVariants(model?.variants)
  const variant =
    typeof model?.variant === "string" && model.variant.trim() ? model.variant.trim() : undefined
  return {
    id,
    name: model?.name?.trim() || id,
    limit: model?.limit,
    modalities: model?.modalities,
    ...(variants ? { variants } : {}),
    ...(variant ? { variant } : {}),
  }
}

/**
 * 规范化模型的思考等级（variants）。
 */
const normalizeVariants = (value: unknown): Record<string, Record<string, unknown>> | undefined => {
  if (!isRecord(value)) return undefined
  const result: Record<string, Record<string, unknown>> = {}
  for (const [key, val] of Object.entries(value)) {
    const trimmedKey = key.trim()
    if (!trimmedKey) continue
    if (isRecord(val)) {
      result[trimmedKey] = val
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * 规范化模型限制。
 */
const normalizeLimit = (value: unknown): ModelProviderModel["limit"] => {
  if (!isRecord(value) || typeof value.context !== "number" || typeof value.output !== "number") {
    return undefined
  }
  return { context: value.context, output: value.output }
}

/**
 * 规范化模型模态。
 */
const normalizeModalities = (value: unknown): ModelProviderModel["modalities"] => {
  if (
    !isRecord(value) ||
    !Array.isArray(value.input) ||
    !Array.isArray(value.output) ||
    !value.input.every((item) => typeof item === "string") ||
    !value.output.every((item) => typeof item === "string")
  ) {
    return undefined
  }
  return { input: value.input, output: value.output }
}

/**
 * 规范化模型选择，非法值回退到第一个可用模型。
 */
const normalizeSelection = (
  value: Partial<ModelSelection> | undefined,
  providers: Record<string, ModelProvider>,
  fallback?: ModelSelection,
): ModelSelection => {
  const providerIds = Object.keys(providers)
  const provider =
    value?.provider && providers[value.provider]
      ? value.provider
      : (fallback?.provider ?? providerIds[0] ?? "")
  const models = provider ? (providers[provider]?.models ?? {}) : {}
  const model =
    value?.model && models[value.model]
      ? value.model
      : (fallback?.model ?? Object.keys(models)[0] ?? "")
  const variant =
    typeof value?.variant === "string" && value.variant.trim()
      ? value.variant.trim()
      : (fallback?.variant ?? models[model]?.variant)
  return { provider, model, ...(variant ? { variant } : {}) }
}

/**
 * 规范化压缩模型选择。如果未配置（provider 为空）或 provider 不存在，则回退为 { provider: "", model: "" }，代表“跟随当前会话”。
 */
const normalizeCompactionSelection = (
  value: Partial<ModelSelection> | undefined,
  providers: Record<string, ModelProvider>,
): ModelSelection => {
  if (!value || !value.provider || !providers[value.provider]) {
    return { provider: "", model: "" }
  }
  const provider = value.provider
  const models = providers[provider]?.models ?? {}
  const model = value.model && models[value.model] ? value.model : (Object.keys(models)[0] ?? "")
  return { provider, model }
}

/**
 * 规范化单个 Provider 配置。
 */
const normalizeProvider = (id: string, provider: RawProvider): ModelProvider => ({
  id,
  type: inferProviderType(provider),
  name: provider.name?.trim() || id,
  options: {
    apiKey: provider.options?.apiKey ?? "",
    baseURL: provider.options?.baseURL?.replace(/\/$/, "") ?? "",
  },
  models: Object.fromEntries(
    Object.entries(provider.models ?? {}).map(([modelId, model]) => [
      modelId,
      normalizeModel(modelId, model),
    ]),
  ),
})

/**
 * 将编辑态配置规范化为存储结构，并校验唯一标识。
 */
const normalizeSettings = (settings: ModelProviderSettings): ModelProviderSettings => {
  if (
    !isRecord(settings) ||
    !isRecord(settings.providers) ||
    !Array.isArray(settings.enabledProviders)
  ) {
    throw new Error("INVALID_MODEL_PROVIDER_SETTINGS")
  }

  const providerIds = new Set<string>()
  const providerIdByKey = new Map<string, string>()
  const providers = Object.fromEntries(
    Object.entries(settings.providers).map(([key, provider]) => {
      if (!isRecord(provider) || !isRecord(provider.options) || !isRecord(provider.models)) {
        throw new Error("INVALID_MODEL_PROVIDER")
      }

      const id = typeof provider.id === "string" ? provider.id.trim() : ""
      if (!id) throw new Error("Provider ID 不能为空")
      if (providerIds.has(id)) throw new Error(`Provider ID 重复: ${id}`)
      providerIds.add(id)
      providerIdByKey.set(key, id)

      const modelIds = new Set<string>()
      const models = Object.fromEntries(
        Object.entries(provider.models).map(([modelKey, model]) => {
          if (!isRecord(model)) throw new Error("INVALID_PROVIDER_MODEL")
          const modelId = typeof model.id === "string" ? model.id.trim() : modelKey
          if (!modelId) throw new Error("Model ID 不能为空")
          if (modelIds.has(modelId)) throw new Error(`Model ID 重复: ${modelId}`)
          modelIds.add(modelId)
          const limit = normalizeLimit(model.limit)
          const modalities = normalizeModalities(model.modalities)
          const variants = normalizeVariants(model.variants)
          const variant =
            typeof model.variant === "string" && model.variant.trim()
              ? model.variant.trim()
              : undefined
          return [
            modelId,
            {
              id: modelId,
              name: typeof model.name === "string" ? model.name.trim() || modelId : modelId,
              ...(limit ? { limit } : {}),
              ...(modalities ? { modalities } : {}),
              ...(variants ? { variants } : {}),
              ...(variant ? { variant } : {}),
            },
          ]
        }),
      )

      const type = provider.type
      if (
        type !== "openai" &&
        type !== "anthropic" &&
        type !== "google" &&
        type !== "openai-compatible"
      ) {
        throw new Error("Provider type 不支持")
      }

      return [
        id,
        {
          id,
          type,
          name: typeof provider.name === "string" ? provider.name.trim() || id : id,
          options: {
            apiKey:
              typeof provider.options.apiKey === "string" ? provider.options.apiKey.trim() : "",
            baseURL:
              typeof provider.options.baseURL === "string"
                ? provider.options.baseURL.trim().replace(/\/$/, "")
                : "",
          },
          models,
        },
      ]
    }),
  )

  const enabledProviders = Array.from(
    new Set(
      settings.enabledProviders
        .filter(
          (providerId): providerId is string =>
            typeof providerId === "string" &&
            Boolean(providers[providerIdByKey.get(providerId) ?? providerId]),
        )
        .map((providerId) => providerIdByKey.get(providerId) ?? providerId),
    ),
  )

  const defaultModel = normalizeSelection(settings.defaultModel, providers)
  const streamIdleTimeoutMs = clampNonNegativeInt(
    settings.streamIdleTimeoutMs,
    DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  )
  return {
    providers,
    enabledProviders,
    defaultModel,
    titleSummary: normalizeSelection(settings.titleSummary, providers, defaultModel),
    suggestedQuestions: normalizeSelection(settings.suggestedQuestions, providers, defaultModel),
    compactionModel: normalizeCompactionSelection(settings.compactionModel, providers),
    suggestedQuestionsEnabled: settings.suggestedQuestionsEnabled === true,
    compactionEnabled: settings.compactionEnabled !== false,
    streamIdleTimeoutMs,
  }
}

/**
 * 读取可编辑的模型 Provider 配置。
 */
export const getModelProviderSettings = (): ModelProviderSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  const rawAi = isRecord(rawConfig.ai) ? (rawConfig.ai as RawAiConfig) : {}
  const rawProviders = rawAi.providers ?? (rawConfig.bailian ? { bailian: rawConfig.bailian } : {})
  const providers = Object.fromEntries(
    Object.entries(rawProviders).map(([id, provider]) => [id, normalizeProvider(id, provider)]),
  )

  const defaultModel = normalizeSelection(rawAi.defaultModel, providers)
  const streamIdleTimeoutMs = clampNonNegativeInt(
    rawAi.streamIdleTimeoutMs,
    DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  )
  return {
    providers,
    enabledProviders: (rawAi.enabled_providers ?? Object.keys(providers)).filter((providerId) =>
      Boolean(providers[providerId]),
    ),
    defaultModel,
    titleSummary: normalizeSelection(rawAi.titleSummary, providers, defaultModel),
    suggestedQuestions: normalizeSelection(rawAi.suggestedQuestions, providers, defaultModel),
    compactionModel: normalizeCompactionSelection(rawAi.compactionModel, providers),
    suggestedQuestionsEnabled: rawAi.suggestedQuestionsEnabled === true,
    compactionEnabled: getCompactionSettings().enabled,
    streamIdleTimeoutMs,
  }
}

/**
 * 保存模型 Provider 配置，同时保留配置文件中未由设置页管理的字段。
 */
export const saveModelProviderSettings = (input: ModelProviderSettings): ModelProviderSettings => {
  const settings = normalizeSettings(input)
  updateRawConfig((rawConfig) => {
    const rawAiObj = isRecord(rawConfig.ai) ? { ...rawConfig.ai } : {}
    delete rawAiObj.weeklySummary
    // 保留 compaction 节点的未由设置页管理的字段（阈值等），仅覆盖 enabled。
    const rawCompaction = isRecord(rawAiObj.compaction) ? { ...rawAiObj.compaction } : {}

    return {
      ...rawConfig,
      ai: {
        ...rawAiObj,
        enabled_providers: settings.enabledProviders,
        providers: settings.providers,
        defaultModel: settings.defaultModel,
        titleSummary: settings.titleSummary,
        suggestedQuestions: settings.suggestedQuestions,
        compactionModel: settings.compactionModel,
        suggestedQuestionsEnabled: settings.suggestedQuestionsEnabled,
        compaction: { ...rawCompaction, enabled: settings.compactionEnabled },
        streamIdleTimeoutMs: settings.streamIdleTimeoutMs,
      },
    }
  })

  return settings
}
