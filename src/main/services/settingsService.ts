import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { PermissionSettings } from "@shared/contracts/agent"
import type {
  CompactionSettings,
  Locale,
  ModelProvider,
  ModelProviderModel,
  ModelProviderSettings,
  ModelSelection,
  ProviderTransportType,
  UiSettings,
} from "@shared/settings"
import { DEFAULT_COMPACTION_SETTINGS, DEFAULT_UI_SETTINGS } from "@shared/settings"
import { getConfigPath } from "@/paths"

// 原始 Provider 配置。
type RawProvider = {
  type?: ProviderTransportType
  name?: string
  npm?: string
  options?: {
    apiKey?: string
    baseURL?: string
  }
  models?: Record<string, Partial<ModelProviderModel>>
}

// 原始 AI 配置。
type RawAiConfig = {
  defaultModel?: Partial<ModelSelection>
  titleSummary?: Partial<ModelSelection>
  suggestedQuestions?: Partial<ModelSelection>
  compactionModel?: Partial<ModelSelection>
  suggestedQuestionsEnabled?: boolean
  enabled_providers?: string[]
  providers?: Record<string, RawProvider>
  [key: string]: unknown
}

// 原始配置文件。
type RawConfig = {
  ai?: RawAiConfig
  bailian?: RawProvider
  [key: string]: unknown
}

/**
 * 判断值是否为普通对象。
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

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
 * 读取配置文件，缺失或为空时返回空配置。
 */
const readRawConfig = (configPath: string): RawConfig => {
  if (!existsSync(configPath)) return {}

  const rawText = readFileSync(configPath, "utf8").trim()
  if (!rawText) return {}

  const parsed = JSON.parse(rawText) as unknown
  if (!isRecord(parsed)) throw new Error("配置文件根节点必须是对象")
  return parsed as RawConfig
}

/**
 * 规范化单个模型配置。
 */
const normalizeModel = (
  id: string,
  model: Partial<ModelProviderModel> | undefined,
): ModelProviderModel => ({
  id,
  name: model?.name?.trim() || id,
  limit: model?.limit,
  modalities: model?.modalities,
})

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
  return { provider, model }
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
          return [
            modelId,
            {
              id: modelId,
              name: typeof model.name === "string" ? model.name.trim() || modelId : modelId,
              ...(limit ? { limit } : {}),
              ...(modalities ? { modalities } : {}),
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
  return {
    providers,
    enabledProviders,
    defaultModel,
    titleSummary: normalizeSelection(settings.titleSummary, providers, defaultModel),
    suggestedQuestions: normalizeSelection(settings.suggestedQuestions, providers, defaultModel),
    compactionModel: normalizeCompactionSelection(settings.compactionModel, providers),
    suggestedQuestionsEnabled: settings.suggestedQuestionsEnabled === true,
    compactionEnabled: settings.compactionEnabled !== false,
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
  }
}

/**
 * 保存模型 Provider 配置，同时保留配置文件中未由设置页管理的字段。
 */
export const saveModelProviderSettings = (input: ModelProviderSettings): ModelProviderSettings => {
  const settings = normalizeSettings(input)
  const configPath = getConfigPath()
  const rawConfig = readRawConfig(configPath)
  const directory = dirname(configPath)
  mkdirSync(directory, { recursive: true })

  const rawAiObj = isRecord(rawConfig.ai) ? { ...rawConfig.ai } : {}
  delete rawAiObj.weeklySummary
  // 保留 compaction 节点的未由设置页管理的字段（阈值等），仅覆盖 enabled。
  const rawCompaction = isRecord(rawAiObj.compaction) ? { ...rawAiObj.compaction } : {}

  const nextConfig: RawConfig = {
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
    },
  }
  const temporaryPath = `${configPath}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8")
  renameSync(temporaryPath, configPath)

  return settings
}

// 权限配置默认值（缺失/损坏时回退，默认安全）。
const DEFAULT_PERMISSION_SETTINGS: PermissionSettings = {
  defaultMode: "default",
  allow: [],
  deny: [],
  ask: [],
}

/**
 * 规范化权限配置：校验 defaultMode 枚举与规则数组；非法值回退默认，不抛错。
 * 规则字符串格式在权限引擎解析时校验（非法条目跳过并记警告）。
 */
const normalizePermissionSettings = (raw: unknown): PermissionSettings => {
  if (!isRecord(raw)) return DEFAULT_PERMISSION_SETTINGS
  const mode = raw.defaultMode
  const defaultMode = mode === "acceptEdits" || mode === "bypassPermissions" ? mode : "default"
  const toStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
  return {
    defaultMode,
    allow: toStringArray(raw.allow),
    deny: toStringArray(raw.deny),
    ask: toStringArray(raw.ask),
  }
}

/**
 * 读取 Agent 权限配置（缺失/损坏回退默认）。
 */
export const getPermissionSettings = (): PermissionSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  const rawAgent = isRecord(rawConfig.agent) ? rawConfig.agent : {}
  return normalizePermissionSettings(rawAgent.permissions)
}

/**
 * 保存 Agent 权限配置，合并 agent.permissions 节点并保留其他字段（含 agent.mcp）。
 */
export const savePermissionSettings = (input: PermissionSettings): PermissionSettings => {
  const settings = normalizePermissionSettings(input)
  const configPath = getConfigPath()
  const rawConfig = readRawConfig(configPath)
  const directory = dirname(configPath)
  mkdirSync(directory, { recursive: true })

  const rawAgentObj = isRecord(rawConfig.agent) ? { ...rawConfig.agent } : {}
  const nextConfig: RawConfig = {
    ...rawConfig,
    agent: {
      ...rawAgentObj,
      permissions: settings,
    },
  }
  const temporaryPath = `${configPath}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8")
  renameSync(temporaryPath, configPath)

  return settings
}

// 非零正整数（压缩配置字段校验）；非法回退默认值。
const clampPositiveInt = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback

/**
 * 读取上下文压缩配置（ai.compaction 节点）；缺失/非法字段回退默认值，不抛错。
 */
export const getCompactionSettings = (): CompactionSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  const rawAi = isRecord(rawConfig.ai) ? (rawConfig.ai as RawAiConfig) : {}
  const rawCompaction = isRecord(rawAi.compaction) ? rawAi.compaction : {}
  return {
    enabled: rawCompaction.enabled !== false,
    contextWindow: clampPositiveInt(
      rawCompaction.contextWindow,
      DEFAULT_COMPACTION_SETTINGS.contextWindow,
    ),
    keepRecentTokens: clampPositiveInt(
      rawCompaction.keepRecentTokens,
      DEFAULT_COMPACTION_SETTINGS.keepRecentTokens,
    ),
    reserveTokens: clampPositiveInt(
      rawCompaction.reserveTokens,
      DEFAULT_COMPACTION_SETTINGS.reserveTokens,
    ),
  }
}

/**
 * 规范化 UI 客户端配置。
 */
const normalizeUiSettings = (raw: unknown): UiSettings => {
  if (!isRecord(raw)) return DEFAULT_UI_SETTINGS
  const locale =
    raw.locale === "zh" || raw.locale === "en" ? (raw.locale as Locale) : DEFAULT_UI_SETTINGS.locale
  return {
    locale,
  }
}

/**
 * 读取 UI 客户端配置。
 */
export const getUiSettings = (): UiSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  return normalizeUiSettings(rawConfig.ui)
}

/**
 * 保存 UI 客户端配置。
 */
export const saveUiSettings = (input: UiSettings): UiSettings => {
  const settings = normalizeUiSettings(input)
  const configPath = getConfigPath()
  const rawConfig = readRawConfig(configPath)
  const directory = dirname(configPath)
  mkdirSync(directory, { recursive: true })

  const rawUiObj = isRecord(rawConfig.ui) ? { ...rawConfig.ui } : {}
  const nextConfig: RawConfig = {
    ...rawConfig,
    ui: {
      ...rawUiObj,
      ...settings,
    },
  }
  const temporaryPath = `${configPath}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8")
  renameSync(temporaryPath, configPath)

  return settings
}
