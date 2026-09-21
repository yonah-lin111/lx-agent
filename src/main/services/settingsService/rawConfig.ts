import type { ModelProviderModel, ModelSelection, ProviderTransportType } from "@shared/settings"

import { getConfigPath } from "@/paths"

import { type ConfigTree, readMergedConfig, updateMergedConfig } from "./configStore"

// 原始 Provider 配置。
export type RawProvider = {
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
export type RawAiConfig = {
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
export type RawConfig = {
  ai?: RawAiConfig
  bailian?: RawProvider
  // 内置 Provider 记录（独立文件 builtin-providers.json，不与用户自定义混存）。
  builtinProviders?: Record<string, RawProvider>
  [key: string]: unknown
}

/**
 * 判断值是否为普通对象。
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * 读取配置文件（合并 `~/.lx/config/` 全部布局文件；旧单文件在首次读取时自动迁移）。
 */
export const readRawConfig = (configPath: string): RawConfig =>
  readMergedConfig(configPath) as RawConfig

/**
 * 读取配置、按变更函数构建新配置并原子写盘：只重写发生变化的顶层 key 所属文件，其余文件保持不动。
 */
export const updateRawConfig = (mutate: (rawConfig: RawConfig) => RawConfig): void => {
  updateMergedConfig(getConfigPath(), (rawConfig) => mutate(rawConfig as RawConfig) as ConfigTree)
}

// 非负整数（超时时间配置，0 表示无限）；非法回退默认值。
export const clampNonNegativeInt = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback

// 非零正整数（压缩配置字段校验）；非法回退默认值。
export const clampPositiveInt = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
