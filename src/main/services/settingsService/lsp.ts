import {
  ALL_LSP_LANGUAGE_IDS,
  DEFAULT_LSP_SETTINGS,
  type LspLanguageConfig,
  type LspLanguageId,
  type LspSettings,
} from "@shared/settings"

import { getConfigPath } from "@/paths"

import { isRecord, readRawConfig, updateRawConfig } from "./rawConfig"

/**
 * 规范化 LSP 配置。
 */
const normalizeLspSettings = (raw: unknown): LspSettings => {
  if (!isRecord(raw)) return DEFAULT_LSP_SETTINGS

  const rawLanguages = isRecord(raw.languages) ? raw.languages : raw
  const languages: Partial<Record<LspLanguageId, LspLanguageConfig>> = {}

  for (const id of ALL_LSP_LANGUAGE_IDS) {
    const item = rawLanguages[id]
    if (isRecord(item)) {
      const enabled = typeof item.enabled === "boolean" ? item.enabled : true
      const customPath = typeof item.customPath === "string" ? item.customPath.trim() : ""
      const args = Array.isArray(item.args)
        ? item.args.filter((arg): arg is string => typeof arg === "string")
        : []
      languages[id] = { enabled, customPath, args }
    } else {
      languages[id] = { ...DEFAULT_LSP_SETTINGS.languages[id]! }
    }
  }

  return { languages }
}

/**
 * 读取 LSP 设置。
 */
export const getLspSettings = (): LspSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  const rawAgent = isRecord(rawConfig.agent) ? rawConfig.agent : {}
  return normalizeLspSettings(rawAgent.lsp)
}

/**
 * 保存 LSP 设置。
 */
export const saveLspSettings = (input: LspSettings): LspSettings => {
  const settings = normalizeLspSettings(input)
  updateRawConfig((rawConfig) => {
    const rawAgentObj = isRecord(rawConfig.agent) ? { ...rawConfig.agent } : {}
    return {
      ...rawConfig,
      agent: {
        ...rawAgentObj,
        lsp: settings,
      },
    }
  })

  return settings
}
