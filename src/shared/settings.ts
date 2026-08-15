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
  compactionModel?: ModelSelection
  suggestedQuestionsEnabled: boolean
  // 上下文压缩开关（ai.compaction.enabled；设置页功能配置区维护）。
  compactionEnabled: boolean
}

// 上下文压缩配置（~/.lx/config.json 的 ai.compaction 节点）。
export type CompactionSettings = {
  enabled: boolean
  contextWindow: number
  keepRecentTokens: number
  reserveTokens: number
}

// 上下文压缩配置默认值（可配，后续按实际模型窗口调整）。
export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
  enabled: true,
  contextWindow: 128000,
  keepRecentTokens: 20000,
  reserveTokens: 16384,
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
