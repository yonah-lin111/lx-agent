import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { ModelProvider, ModelSelection } from "@shared/settings"
import type { LanguageModel } from "ai"
import { extractReasoningMiddleware, wrapLanguageModel } from "ai"
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

  const rawModel = createLanguageModel(provider, model.id)
  const languageModel = wrapLanguageModel({
    model: rawModel as any,
    middleware: [
      extractReasoningMiddleware({ tagName: "think" }),
      extractReasoningMiddleware({ tagName: "thinking" }),
    ],
  })
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
  return resolveModelSelection(selection)
}

// 解析请求的模型选择；Provider 或模型不存在时返回错误信息。
export const resolveModelSelection = (
  selection: ModelSelection,
): { model: Model } | { error: string } => {
  if (!selection.provider || !selection.model) {
    return { error: "未选择模型。请先在模型选择器中选择模型。" }
  }
  const settings = getModelProviderSettings()
  const provider = settings.providers[selection.provider]
  if (!provider) {
    return { error: `模型 Provider ${selection.provider} 未配置。请在设置中配置模型 Provider。` }
  }
  if (!provider.models[selection.model]) {
    return { error: `所选模型 ${selection.model} 不存在。请在设置中重新选择模型。` }
  }
  return { model: { provider: selection.provider, id: selection.model } }
}

// 按 settings provider 类型装配 AI SDK 模型。
const createLanguageModel = (provider: ModelProvider, modelId: string): LanguageModel => {
  const apiKey = provider.options.apiKey || undefined
  const baseURL = provider.options.baseURL || undefined
  switch (provider.type) {
    case "openai":
      return createOpenAI({
        apiKey,
        baseURL,
      }).chat(modelId) as unknown as LanguageModel
    case "anthropic":
      return createAnthropic({
        apiKey,
        baseURL,
        headers: {
          "anthropic-beta":
            "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
        },
      }).chat(modelId) as unknown as LanguageModel
    case "google":
      return createGoogleGenerativeAI({ apiKey }).chat(modelId) as unknown as LanguageModel
    case "openai-compatible":
      return createOpenAICompatible({
        name: provider.id,
        baseURL: provider.options.baseURL,
        apiKey,
      }).languageModel(modelId) as unknown as LanguageModel
  }
}
