import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { ModelProviderModel, ModelSelection, ProviderTransportType } from "@shared/settings"

import { getConfigPath } from "@/paths"

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
  [key: string]: unknown
}

/**
 * 判断值是否为普通对象。
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * 读取配置文件，缺失或为空时返回空配置。
 */
export const readRawConfig = (configPath: string): RawConfig => {
  if (!existsSync(configPath)) return {}

  const rawText = readFileSync(configPath, "utf8").trim()
  if (!rawText) return {}

  const parsed = JSON.parse(rawText) as unknown
  if (!isRecord(parsed)) throw new Error("配置文件根节点必须是对象")
  return parsed as RawConfig
}

/**
 * 读取配置、按变更函数构建新配置并原子写盘（临时文件 + rename），其余节点原样保留。
 */
export const updateRawConfig = (mutate: (rawConfig: RawConfig) => RawConfig): void => {
  const configPath = getConfigPath()
  const rawConfig = readRawConfig(configPath)
  mkdirSync(dirname(configPath), { recursive: true })

  const nextConfig = mutate(rawConfig)
  const temporaryPath = `${configPath}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8")
  renameSync(temporaryPath, configPath)
}

// 非负整数（超时时间配置，0 表示无限）；非法回退默认值。
export const clampNonNegativeInt = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback

// 非零正整数（压缩配置字段校验）；非法回退默认值。
export const clampPositiveInt = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
