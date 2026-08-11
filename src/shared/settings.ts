import type { PermissionSettings } from "./contracts/agent"

// Provider 传输格式。
export type ProviderTransportType = "openai" | "anthropic" | "google" | "openai-compatible"

// 模型配置。
export type ModelProviderModel = {
  id: string
  name: string
  limit?: {
    context: number
    output: number
  }
  modalities?: {
    input: string[]
    output: string[]
  }
}

// 模型选择配置。
export type ModelSelection = {
  provider: string
  model: string
}

// 模型 Provider 配置。
export type ModelProvider = {
  id: string
  type: ProviderTransportType
  name: string
  options: {
    apiKey: string
    baseURL: string
  }
  models: Record<string, ModelProviderModel>
}

// 可编辑的模型 Provider 设置。
export type ModelProviderSettings = {
  enabledProviders: string[]
  providers: Record<string, ModelProvider>
  defaultModel: ModelSelection
  titleSummary: ModelSelection
  suggestedQuestions: ModelSelection
  suggestedQuestionsEnabled: boolean
}

// 从 Provider 端点获取到的模型信息。
export type FetchedProviderModel = {
  id: string
  ownedBy?: string | null
}

// 获取模型列表的请求参数。
export type FetchModelsInput = {
  baseURL: string
  apiKey: string
}

// 渲染进程可调用的设置 IPC 接口。
export interface SettingsApi {
  settings: {
    getModelProviders: () => Promise<ModelProviderSettings>
    saveModelProviders: (settings: ModelProviderSettings) => Promise<ModelProviderSettings>
    fetchModels: (input: FetchModelsInput) => Promise<FetchedProviderModel[]>
    getPermissionSettings: () => Promise<PermissionSettings>
    savePermissionSettings: (settings: PermissionSettings) => Promise<PermissionSettings>
  }
}
