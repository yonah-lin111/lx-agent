import { DEFAULT_VOICE_SETTINGS, type VoiceSettings } from "@shared/settings"

import { getConfigPath } from "@/paths"

import { isRecord, readRawConfig, updateRawConfig } from "./rawConfig"

/**
 * 规范化 Voice 设置。
 */
export const normalizeVoiceSettings = (raw: unknown): VoiceSettings => {
  if (!isRecord(raw)) return DEFAULT_VOICE_SETTINGS
  return {
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey.trim() : "",
    model:
      typeof raw.model === "string" && raw.model.trim()
        ? raw.model.trim()
        : DEFAULT_VOICE_SETTINGS.model,
    language:
      typeof raw.language === "string" && raw.language.trim()
        ? raw.language.trim()
        : DEFAULT_VOICE_SETTINGS.language,
  }
}

/**
 * 读取 Voice 设置。
 */
export const getVoiceSettings = (): VoiceSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  return normalizeVoiceSettings(rawConfig.voice)
}

/**
 * 保存 Voice 设置。
 */
export const saveVoiceSettings = (input: VoiceSettings): VoiceSettings => {
  const settings = normalizeVoiceSettings(input)
  updateRawConfig((rawConfig) => ({
    ...rawConfig,
    voice: settings,
  }))

  return settings
}
