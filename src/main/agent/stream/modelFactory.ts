import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { ModelProvider, ModelSelection } from "@shared/settings"
import type { LanguageModel } from "ai"
import { getModelProviderSettings } from "@/services/settingsService"
import type { Model } from "../core/types"

// LanguageModel 缓存：按 provider:id 缓存，settings 保存时失效。
const modelCache = new Map<string, LanguageModel>()

// 使 LanguageModel 缓存失效（settings 保存后调用）。
export const invalidateModelCache = (): void => {
  modelCache.clear()
}

// 按本地 Model 解析 AI SDK LanguageModel；provider 缺失或 apiKey 缺失时抛错。
export const resolveLanguageModel = (model: Model): LanguageModel => {
  const key = `${model.provider}:${model.id}`
  const cached = modelCache.get(key)
  if (cached) return cached

  const settings = getModelProviderSettings()
  const provider = settings.providers[model.provider]
  if (!provider) {
    throw new Error(`Provider not found: ${model.provider}。请在设置中配置模型 Provider。`)
  }
  if (!provider.options.apiKey) {
    throw new Error(`Provider ${model.provider} 未配置 API Key。请在设置中配置后重试。`)
  }

  const languageModel = createLanguageModel(provider, model.id)
  modelCache.set(key, languageModel)
  return languageModel
}

// 解析默认模型选择；无可用模型时返回错误信息。
export const resolveDefaultModel = (): { model: Model } | { error: string } => {
  const settings = getModelProviderSettings()
  const selection: ModelSelection | undefined = settings.defaultModel
  if (!selection?.provider || !selection.model) {
    return { error: "未配置默认模型。请在设置中选择模型后重试。" }
  }
  const provider = settings.providers[selection.provider]
  if (!provider || !provider.models[selection.model]) {
    return { error: "默认模型配置已失效。请在设置中重新选择模型。" }
  }
  return { model: { provider: selection.provider, id: selection.model } }
}

// 按 settings provider 类型装配 AI SDK 模型。
const createLanguageModel = (provider: ModelProvider, modelId: string): LanguageModel => {
  const apiKey = provider.options.apiKey || undefined
  switch (provider.type) {
    case "openai":
      return createOpenAI({
        apiKey,
        baseURL: provider.options.baseURL || undefined,
      }).chat(modelId)
    case "anthropic":
      return createAnthropic({ apiKey }).chat(modelId)
    case "google":
      return createGoogleGenerativeAI({ apiKey }).chat(modelId)
    case "openai-compatible":
      return createOpenAICompatible({
        name: provider.id,
        baseURL: provider.options.baseURL,
        apiKey,
      }).languageModel(modelId)
  }
}
