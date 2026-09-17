import { DEFAULT_UI_SETTINGS, type Locale, type UiSettings } from "@shared/settings"

import { getConfigPath } from "@/paths"

import { isRecord, readRawConfig, updateRawConfig } from "./rawConfig"

/**
 * 规范化 UI 客户端配置。
 */
const normalizeUiSettings = (raw: unknown): UiSettings => {
  if (!isRecord(raw)) return DEFAULT_UI_SETTINGS
  const locale =
    raw.locale === "zh" || raw.locale === "en" ? (raw.locale as Locale) : DEFAULT_UI_SETTINGS.locale
  const screenshotCleanupEnabled =
    typeof raw.screenshotCleanupEnabled === "boolean"
      ? raw.screenshotCleanupEnabled
      : DEFAULT_UI_SETTINGS.screenshotCleanupEnabled
  const agentCompletionNotifyEnabled =
    typeof raw.agentCompletionNotifyEnabled === "boolean"
      ? raw.agentCompletionNotifyEnabled
      : DEFAULT_UI_SETTINGS.agentCompletionNotifyEnabled
  const openclawCompletionNotifyEnabled =
    typeof raw.openclawCompletionNotifyEnabled === "boolean"
      ? raw.openclawCompletionNotifyEnabled
      : DEFAULT_UI_SETTINGS.openclawCompletionNotifyEnabled
  return {
    locale,
    screenshotCleanupEnabled,
    agentCompletionNotifyEnabled,
    openclawCompletionNotifyEnabled,
  }
}

/**
 * 读取 UI 客户端配置。
 */
export const getUiSettings = (): UiSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  return normalizeUiSettings(rawConfig.ui)
}

/**
 * 保存 UI 客户端配置。
 */
export const saveUiSettings = (input: UiSettings): UiSettings => {
  const settings = normalizeUiSettings(input)
  updateRawConfig((rawConfig) => {
    const rawUiObj = isRecord(rawConfig.ui) ? { ...rawConfig.ui } : {}
    return {
      ...rawConfig,
      ui: {
        ...rawUiObj,
        ...settings,
      },
    }
  })

  return settings
}
