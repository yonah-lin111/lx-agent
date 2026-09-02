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
  // 流式空闲超时毫秒数（ai.streamIdleTimeoutMs；默认 60000ms / 1 分钟）。
  streamIdleTimeoutMs?: number
}

// 默认流式空闲超时时间（60 秒 / 1 分钟）。
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 60_000

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

// 支持的语言类型。
export type Locale = "en" | "zh"

// UI 客户端配置（~/.lx/config.json 的 ui 节点）。
export type UiSettings = {
  locale: Locale
  // 是否自动清理超过 14 天的剪贴板截图缓存（默认启用）。
  screenshotCleanupEnabled?: boolean
}

export const DEFAULT_UI_SETTINGS: UiSettings = {
  locale: "en",
  screenshotCleanupEnabled: true,
}

// 支持的 CLI 工具标识。
export type CliId = "claude" | "codex" | "gemini" | "opencode" | "agy" | "grok"

// CLI 设置（~/.lx/config.json 的 cli 节点）。
export interface CliSettings {
  enabled: CliId[]
  customPaths?: Partial<Record<CliId, string>>
}

export const ALL_CLI_IDS: readonly CliId[] = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "agy",
  "grok",
] as const

export const DEFAULT_CLI_SETTINGS: CliSettings = {
  enabled: [...ALL_CLI_IDS],
  customPaths: {},
}

// CLI 版本与运行时检测信息。
export interface CliVersionInfo {
  id: CliId
  name: string
  displayName: string
  command?: string
  installed: boolean
  version: string | null
  latestVersion: string | null
  hasUpdate: boolean
  path: string | null
  error: string | null
  installedButBroken: boolean
  npmPackage?: string
  homepage?: string
}

// CLI 生命周期操作结果。
export interface CliLifecycleResult {
  success: boolean
  message?: string
  detail?: string
}

// 支持的 LSP 语言标识。
export type LspLanguageId = "typescript" | "python" | "json" | "html" | "css"

export const ALL_LSP_LANGUAGE_IDS: readonly LspLanguageId[] = [
  "typescript",
  "python",
  "json",
  "html",
  "css",
] as const

// 单个语言 LSP 配置。
export interface LspLanguageConfig {
  enabled: boolean
  customPath?: string
  args?: string[]
}

// LSP 设置（~/.lx/config.json 的 agent.lsp 节点）。
export interface LspSettings {
  languages: Partial<Record<LspLanguageId, LspLanguageConfig>>
}

export const DEFAULT_LSP_SETTINGS: LspSettings = {
  languages: {
    typescript: { enabled: true, customPath: "", args: [] },
    python: { enabled: true, customPath: "", args: [] },
    json: { enabled: true, customPath: "", args: [] },
    html: { enabled: true, customPath: "", args: [] },
    css: { enabled: true, customPath: "", args: [] },
  },
}

// LSP 服务详细检测状态。
export interface LspServerDetailInfo {
  id: LspLanguageId
  name: string
  packageName: string
  defaultBin: string
  installed: boolean
  detectedPath: string | null
  customPath?: string
  enabled: boolean
}

// MCP server 配置（~/.lx/config.json 的 agent.mcp 节点）。
export interface McpServerConfig {
  command: string[]
  cwd?: string
  environment?: Record<string, string>
  disabled?: boolean
  timeout?: number
}

// MCP 设置（~/.lx/config.json 的 agent.mcp 节点）。
export interface McpSettings {
  servers: Record<string, McpServerConfig>
}

export const DEFAULT_MCP_SETTINGS: McpSettings = {
  servers: {},
}

// 渲染进程可调用的设置 IPC 接口。
export interface SettingsApi {
  settings: {
    getModelProviders: () => Promise<ModelProviderSettings>
    saveModelProviders: (settings: ModelProviderSettings) => Promise<ModelProviderSettings>
    fetchModels: (input: FetchModelsInput) => Promise<FetchedProviderModel[]>
    getPermissionSettings: () => Promise<PermissionSettings>
    savePermissionSettings: (settings: PermissionSettings) => Promise<PermissionSettings>
    getUiSettings: () => Promise<UiSettings>
    saveUiSettings: (settings: UiSettings) => Promise<UiSettings>
    getCliSettings: () => Promise<CliSettings>
    saveCliSettings: (settings: CliSettings) => Promise<CliSettings>
    getCliVersions: (options?: { force?: boolean }) => Promise<CliVersionInfo[]>
    runCliLifecycleAction: (
      cliId: CliId,
      action: "install" | "update",
    ) => Promise<CliLifecycleResult>
    getLspSettings: () => Promise<LspSettings>
    saveLspSettings: (settings: LspSettings) => Promise<LspSettings>
    getLspStatus: () => Promise<LspServerDetailInfo[]>
    installLspServer: (packageName: string) => Promise<boolean>
    getMcpSettings: () => Promise<McpSettings>
    saveMcpSettings: (settings: McpSettings) => Promise<McpSettings>
    reconnectMcp: () => Promise<void>
  }
}
