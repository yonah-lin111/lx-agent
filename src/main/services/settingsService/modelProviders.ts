import type { ModelPricing } from "@shared/contracts/usage"
import {
  isBuiltinProviderId,
  type ModelsDevGoCatalog,
  mapModelsDevModel,
  OPENCODE_GO_BASE_URL,
  OPENCODE_GO_PROVIDER_ID,
  type RefreshOpencodeGoResult,
} from "@shared/opencodeGo"
import {
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  type ModelProvider,
  type ModelProviderModel,
  type ModelProviderSettings,
  type ModelSelection,
  type ModelTransportType,
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
 * 规范化模型计价（附带修复：此前读取与保存链路均丢弃 pricing，导致设置页的计价改动无法持久化、用量成本恒为 --）。
 */
const normalizePricing = (value: unknown): ModelPricing | undefined => {
  if (!isRecord(value)) return undefined
  const fields = ["input", "output", "cacheRead", "cacheWrite"] as const
  const pricing = {} as ModelPricing
  for (const field of fields) {
    const parsed = value[field]
    if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < 0) return undefined
    pricing[field] = parsed
  }
  if (
    pricing.input === 0 &&
    pricing.output === 0 &&
    pricing.cacheRead === 0 &&
    pricing.cacheWrite === 0
  ) {
    return undefined
  }
  return pricing
}

/**
 * 规范化模型级传输协议覆盖；非法值丢弃（回退为继承 provider.type）。
 */
const normalizeTransport = (value: unknown): ModelTransportType | undefined => {
  if (
    value === "openai" ||
    value === "anthropic" ||
    value === "google" ||
    value === "openai-compatible" ||
    value === "openai-responses"
  ) {
    return value
  }
  return undefined
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
  const pricing = normalizePricing(model?.pricing)
  const transport = normalizeTransport(model?.transport)
  return {
    id,
    name: model?.name?.trim() || id,
    ...(transport ? { transport } : {}),
    limit: model?.limit,
    modalities: model?.modalities,
    ...(variants ? { variants } : {}),
    ...(variant ? { variant } : {}),
    ...(pricing ? { pricing } : {}),
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
          const pricing = normalizePricing(model.pricing)
          const transport = normalizeTransport(model.transport)
          const variant =
            typeof model.variant === "string" && model.variant.trim()
              ? model.variant.trim()
              : undefined
          return [
            modelId,
            {
              id: modelId,
              name: typeof model.name === "string" ? model.name.trim() || modelId : modelId,
              ...(transport ? { transport } : {}),
              ...(limit ? { limit } : {}),
              ...(modalities ? { modalities } : {}),
              ...(variants ? { variants } : {}),
              ...(variant ? { variant } : {}),
              ...(pricing ? { pricing } : {}),
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
 * 读取可编辑的模型 Provider 配置（用户自定义与内置独立文件合并，内置同名记录优先）。
 */
export const getModelProviderSettings = (): ModelProviderSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  const rawAi = isRecord(rawConfig.ai) ? (rawConfig.ai as RawAiConfig) : {}
  const rawProviders = rawAi.providers ?? (rawConfig.bailian ? { bailian: rawConfig.bailian } : {})
  const rawBuiltin = isRecord(rawConfig.builtinProviders)
    ? (rawConfig.builtinProviders as Record<string, RawProvider>)
    : {}
  // 先用户后内置：同名记录以内置（云端 managed）为准，避免手写残留遮挡。
  const providers = Object.fromEntries(
    [...Object.entries(rawProviders), ...Object.entries(rawBuiltin)].map(([id, provider]) => [
      id,
      normalizeProvider(id, provider),
    ]),
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
 * 内置 Provider（见 BUILTIN_PROVIDER_IDS）写入 builtinProviders 独立节点
 * （独立文件 builtin-providers.json），其余写入 ai.providers。
 */
export const saveModelProviderSettings = (input: ModelProviderSettings): ModelProviderSettings => {
  const settings = normalizeSettings(input)
  const builtinProviders = Object.fromEntries(
    Object.entries(settings.providers).filter(([id]) => isBuiltinProviderId(id)),
  )
  const userProviders = Object.fromEntries(
    Object.entries(settings.providers).filter(([id]) => !isBuiltinProviderId(id)),
  )
  updateRawConfig((rawConfig) => {
    const rawAiObj = isRecord(rawConfig.ai) ? { ...rawConfig.ai } : {}
    delete rawAiObj.weeklySummary
    // 保留 compaction 节点的未由设置页管理的字段（阈值等），仅覆盖 enabled。
    const rawCompaction = isRecord(rawAiObj.compaction) ? { ...rawAiObj.compaction } : {}

    return {
      ...rawConfig,
      builtinProviders,
      ai: {
        ...rawAiObj,
        enabled_providers: settings.enabledProviders,
        providers: userProviders,
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

// 云端模型记录与本地记录的管理字段快照（transport/limit/modalities/variants），用于判定是否需要更新。
const managedSnapshot = (model: ModelProviderModel): string =>
  JSON.stringify({
    transport: model.transport ?? null,
    limit: model.limit ?? null,
    modalities: model.modalities ?? null,
    variants: model.variants ?? null,
  })

/**
 * 将云端目录合并到 OpenCode Go 内置记录：
 * - options（apiKey/baseURL）、展示名、用户默认等级选择原样保留；
 * - 云端模型的 transport/limit/modalities/variants 同步覆盖，存量计价不覆盖（以本地 Go 账单价为准），
 *   缺计价的新模型才用云端 cost 填充；
 * - 云端新增的模型追加；云端已下架的与用户自建的模型一律保留（不删数据）。
 */
export const mergeOpencodeGoCatalog = (
  existing: ModelProvider | undefined,
  catalog: ModelsDevGoCatalog,
): { provider: ModelProvider; added: string[]; updated: string[] } => {
  const added: string[] = []
  const updated: string[] = []
  const models: Record<string, ModelProviderModel> = {}
  for (const [modelKey, current] of Object.entries(existing?.models ?? {})) {
    models[modelKey] = { ...current }
  }
  for (const cloud of Object.values(catalog.models)) {
    const modelId = typeof cloud.id === "string" ? cloud.id.trim() : ""
    if (!modelId) continue
    const mapped = mapModelsDevModel({ ...cloud, id: modelId }, catalog.npm)
    const current = models[modelId]
    if (!current) {
      models[modelId] = mapped
      added.push(modelId)
      continue
    }
    const next: ModelProviderModel = {
      ...current,
      ...(mapped.transport ? { transport: mapped.transport } : {}),
      ...(mapped.limit ? { limit: mapped.limit } : {}),
      ...(mapped.modalities ? { modalities: mapped.modalities } : {}),
      ...(mapped.variants ? { variants: mapped.variants } : {}),
      // 存量计价保留，仅缺失时用云端填充。
      ...(current.pricing ? {} : mapped.pricing ? { pricing: mapped.pricing } : {}),
    }
    // 云端移除的覆盖/档位要同步删除（transport/variants 缺席即删）。
    if (!mapped.transport) delete next.transport
    if (!mapped.limit) delete next.limit
    if (!mapped.modalities) delete next.modalities
    if (!mapped.variants) delete next.variants
    if (managedSnapshot(current) !== managedSnapshot(next)) updated.push(modelId)
    models[modelId] = next
  }
  const provider: ModelProvider = {
    id: OPENCODE_GO_PROVIDER_ID,
    type: "openai-compatible",
    name: existing?.name?.trim() || catalog.providerName || "OpenCode Go",
    options: {
      apiKey: existing?.options.apiKey ?? "",
      baseURL: existing?.options.baseURL || OPENCODE_GO_BASE_URL,
    },
    models,
  }
  return { provider, added, updated }
}

/**
 * 从云端（models.dev）刷新 OpenCode Go 内置记录的模型与思考等级。
 * loader 可注入（测试用）；默认实现见 modelFetchService.fetchModelsDevCatalog。
 * 仅重写 builtinProviders 节点，用户配置与启用状态不受影响
 * （新建记录时自动启用）。
 */
export const refreshOpencodeGoProvider = async (
  loadCatalog: () => Promise<ModelsDevGoCatalog>,
): Promise<RefreshOpencodeGoResult> => {
  const catalog = await loadCatalog()
  const rawConfig = readRawConfig(getConfigPath())
  const rawBuiltin = isRecord(rawConfig.builtinProviders)
    ? (rawConfig.builtinProviders as Record<string, RawProvider>)
    : {}
  const existingRaw = rawBuiltin[OPENCODE_GO_PROVIDER_ID]
  const existing = existingRaw ? normalizeProvider(OPENCODE_GO_PROVIDER_ID, existingRaw) : undefined
  const { provider, added, updated } = mergeOpencodeGoCatalog(existing, catalog)
  const created = !existing
  updateRawConfig((current) => ({
    ...current,
    builtinProviders: {
      ...(isRecord(current.builtinProviders) ? current.builtinProviders : {}),
      [provider.id]: provider,
    },
  }))
  if (created) {
    // 新建记录自动启用（沿用读取侧默认：enabled 缺省即全量）。
    const settings = getModelProviderSettings()
    if (!settings.enabledProviders.includes(provider.id)) {
      saveModelProviderSettings({
        ...settings,
        enabledProviders: [...settings.enabledProviders, provider.id],
      })
    }
  }
  return { providerId: provider.id, added, updated }
}
