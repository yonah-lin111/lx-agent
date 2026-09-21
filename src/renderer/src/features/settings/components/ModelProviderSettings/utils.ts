import { OPENCODE_GO_PROVIDER_ID } from "@shared/opencodeGo"
import type { ModelProvider } from "@/features/settings/types"
import { OPENCODE_GO_PRESET, OPENCODE_GO_PRESET_BASE_URL } from "./constants"

/**
 * 生成未占用的 Provider 标识。
 */
export const createProviderId = (providers: Record<string, ModelProvider>): string => {
  let index = Object.keys(providers).length + 1
  let id = `provider-${index}`
  while (providers[id]) {
    index += 1
    id = `provider-${index}`
  }
  return id
}

/**
 * 将获取模型列表的错误转换为用户可读的中文提示。
 */
export const toFetchModelsErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("HTTP 401") || message.includes("HTTP 403")) {
    return "认证失败，请检查 API Key"
  }
  if (
    message.includes("All candidates failed") ||
    message.includes("HTTP 404") ||
    message.includes("HTTP 405")
  ) {
    return "获取模型失败，请检查 Base URL 是否支持 /models 接口"
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "请求超时"
  }
  if (message.includes("Failed to parse")) {
    return "响应格式不支持"
  }
  return "获取模型失败"
}

/**
 * 模糊匹配：查询串的字符需按顺序出现在目标串中即匹配（忽略大小写）。
 */
export const fuzzyMatches = (target: string, query: string): boolean => {
  let index = 0
  for (const char of query) {
    index = target.indexOf(char, index)
    if (index === -1) return false
    index += 1
  }
  return true
}

/**
 * 查找已存在的 OpenCode Go 预设记录 key（记录 key 或 provider.id 命中即算存在，兼容 ID 改名前的中间态）。
 */
export const findOpencodeGoKey = (providers: Record<string, ModelProvider>): string | undefined =>
  Object.entries(providers).find(
    ([key, provider]) =>
      key === OPENCODE_GO_PROVIDER_ID || provider?.id === OPENCODE_GO_PROVIDER_ID,
  )?.[0]

/**
 * OpenCode Go 预设是否尚未创建。
 */
export const isOpencodeGoMissing = (providers: Record<string, ModelProvider>): boolean =>
  findOpencodeGoKey(providers) === undefined

/**
 * 一键创建 OpenCode Go 预设（幂等：已存在时跳过不覆盖，并自动启用）。
 */
export const applyOpencodeGoPreset = (
  providers: Record<string, ModelProvider>,
  enabledProviders: string[],
): {
  providers: Record<string, ModelProvider>
  enabledProviders: string[]
  added: boolean
} => {
  if (findOpencodeGoKey(providers) !== undefined) {
    return { providers, enabledProviders, added: false }
  }
  const id = OPENCODE_GO_PRESET.id
  const nextProviders: Record<string, ModelProvider> = {
    ...providers,
    [id]: {
      id,
      type: OPENCODE_GO_PRESET.type,
      name: OPENCODE_GO_PRESET.name,
      options: { apiKey: "", baseURL: OPENCODE_GO_PRESET_BASE_URL },
      models: Object.fromEntries(
        OPENCODE_GO_PRESET.models.map((model) => [
          model.id,
          {
            ...model,
            limit: model.limit ? { ...model.limit } : undefined,
            modalities: model.modalities
              ? { input: [...model.modalities.input], output: [...model.modalities.output] }
              : undefined,
            pricing: model.pricing ? { ...model.pricing } : undefined,
            variants: model.variants
              ? Object.fromEntries(
                  Object.entries(model.variants).map(([key, config]) => [key, { ...config }]),
                )
              : undefined,
          },
        ]),
      ),
    },
  }
  return {
    providers: nextProviders,
    enabledProviders: enabledProviders.includes(id) ? enabledProviders : [...enabledProviders, id],
    added: true,
  }
}
