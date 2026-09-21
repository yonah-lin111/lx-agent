import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { OPENCODE_GO_CLIENT_ID, OPENCODE_GO_PROVIDER_ID } from "@shared/opencodeGo"
import { type ModelProvider, type ModelSelection, resolveModelTransport } from "@shared/settings"
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
  const configuredModel = provider.models[selection.model]
  const variant = selection.variant ?? configuredModel.variant
  return {
    model: {
      provider: selection.provider,
      id: selection.model,
      ...(variant ? { variant } : {}),
    },
  }
}

// 是否为 OpenCode Go 预设（按 provider.id 精确匹配；改名后视为普通自定义 Provider）。
const isOpencodeGoProvider = (provider: ModelProvider): boolean =>
  provider.id === OPENCODE_GO_PROVIDER_ID

// Go 要求的静态客户端标识（自报身份而非通用 SDK 名；会话级 x-opencode-session 另行透传）。
const opencodeGoHeaders = { "x-opencode-client": OPENCODE_GO_CLIENT_ID }

// 按模型实际传输协议装配 AI SDK 模型（模型级 transport 覆盖优先，缺省继承 provider.type）。
const createLanguageModel = (provider: ModelProvider, modelId: string): LanguageModel => {
  const apiKey = provider.options.apiKey || undefined
  const baseURL = provider.options.baseURL || undefined
  const isGo = isOpencodeGoProvider(provider)
  switch (resolveModelTransport(provider, modelId)) {
    case "openai": {
      const openai = createOpenAI({
        apiKey,
        baseURL,
        ...(isGo ? { headers: { ...opencodeGoHeaders } } : {}),
      })
      return openai.chat(modelId) as unknown as LanguageModel
    }
    case "openai-responses": {
      const openai = createOpenAI({
        apiKey,
        baseURL,
        ...(isGo ? { headers: { ...opencodeGoHeaders } } : {}),
      })
      return openai.responses(modelId) as unknown as LanguageModel
    }
    case "anthropic":
      return createAnthropic({
        apiKey,
        baseURL,
        headers: {
          "anthropic-beta":
            "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
          ...(isGo ? { ...opencodeGoHeaders } : {}),
        },
      }).chat(modelId) as unknown as LanguageModel
    case "google":
      return createGoogleGenerativeAI({ apiKey }).chat(modelId) as unknown as LanguageModel
    case "openai-compatible":
      return createOpenAICompatible({
        name: provider.id,
        baseURL: provider.options.baseURL,
        apiKey,
        ...(isGo ? { headers: { ...opencodeGoHeaders } } : {}),
      }).languageModel(modelId) as unknown as LanguageModel
  }
}
