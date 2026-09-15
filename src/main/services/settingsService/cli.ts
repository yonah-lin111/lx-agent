import { ALL_CLI_IDS, type CliId, type CliSettings, DEFAULT_CLI_SETTINGS } from "@shared/settings"

import { getConfigPath } from "@/paths"

import { isRecord, readRawConfig, updateRawConfig } from "./rawConfig"

/**
 * 规范化 CLI 配置。
 */
const normalizeCliSettings = (raw: unknown): CliSettings => {
  if (!isRecord(raw)) return DEFAULT_CLI_SETTINGS

  const validIds = new Set<string>(ALL_CLI_IDS)
  const enabled = Array.isArray(raw.enabled)
    ? raw.enabled.filter((id): id is CliId => typeof id === "string" && validIds.has(id))
    : [...ALL_CLI_IDS]

  const customPaths: Partial<Record<CliId, string>> = {}
  if (isRecord(raw.customPaths)) {
    for (const [key, val] of Object.entries(raw.customPaths)) {
      if (validIds.has(key) && typeof val === "string" && val.trim()) {
        customPaths[key as CliId] = val.trim()
      }
    }
  }

  return {
    enabled,
    customPaths,
  }
}

/**
 * 读取 CLI 设置。
 */
export const getCliSettings = (): CliSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  return normalizeCliSettings(rawConfig.cli)
}

/**
 * 保存 CLI 设置。
 */
export const saveCliSettings = (input: CliSettings): CliSettings => {
  const settings = normalizeCliSettings(input)
  updateRawConfig((rawConfig) => {
    const rawCliObj = isRecord(rawConfig.cli) ? { ...rawConfig.cli } : {}
    return {
      ...rawConfig,
      cli: {
        ...rawCliObj,
        ...settings,
      },
    }
  })

  return settings
}
