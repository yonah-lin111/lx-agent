import { getModelProviderSettings } from "@/services/settingsService"

// 无 modalities 配置时的回退关键词（对齐 renderer AgentPage 的 supportsImages 启发式）。
const IMAGE_MODEL_KEYWORDS = ["gpt-4o", "claude-3", "gemini"]

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
  return IMAGE_MODEL_KEYWORDS.some((keyword) => normalized.includes(keyword))
}
