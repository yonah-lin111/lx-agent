import { getModelProviderSettings } from "@/services/settingsService"

// 无 modalities 配置时的回退关键词（对齐 renderer AgentPage 的 supportsImages 启发式）。
const IMAGE_MODEL_KEYWORDS = [
  "gpt-4o",
  "gpt-4.1",
  "gpt-4-turbo",
  "gpt-5",
  "claude-3",
  "claude-sonnet-4",
  "claude-opus-4",
  "claude-haiku-4",
  "gemini",
]

// 短关键词按 token 边界匹配，避免误伤 "foo3" 这类本地模型名。
const IMAGE_MODEL_SHORT_PATTERNS = [/(^|[^a-z0-9])o3([^a-z0-9]|$)/, /(^|[^a-z0-9])o4([^a-z0-9]|$)/]

/**
 * 判定模型是否支持图片输入。
 *
 * 优先读 Provider 模型配置的 `modalities.input`；配置缺失时回退模型名关键词启发式。
 */
export const modelSupportsImageInput = (providerId: string, modelId: string): boolean => {
  const settings = getModelProviderSettings()
  const model = settings.providers[providerId]?.models?.[modelId]
  if (model?.modalities?.input) {
    return model.modalities.input.includes("image")
  }
  const normalized = modelId.toLowerCase()
  return (
    IMAGE_MODEL_KEYWORDS.some((keyword) => normalized.includes(keyword)) ||
    IMAGE_MODEL_SHORT_PATTERNS.some((pattern) => pattern.test(normalized))
  )
}
