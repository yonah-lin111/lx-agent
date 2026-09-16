// Token Saver 设置读写（~/.lx/config.json 的 tokenSaver 节点）。
import {
  CAVEMAN_LEVELS,
  type CavemanLevel,
  DEFAULT_TOKEN_SAVER_SETTINGS,
  PONYTAIL_LEVELS,
  type PonytailLevel,
  type TokenSaverSettings,
} from "@shared/settings"

import { getConfigPath } from "@/paths"

import { isRecord, readRawConfig, updateRawConfig } from "./rawConfig"

const CAVEMAN_LEVEL_SET = new Set<string>(CAVEMAN_LEVELS)
const PONYTAIL_LEVEL_SET = new Set<string>(PONYTAIL_LEVELS)

// 规范化 Caveman 档位；非法值回退默认档位。
const normalizeCavemanLevel = (value: unknown): CavemanLevel =>
  typeof value === "string" && CAVEMAN_LEVEL_SET.has(value)
    ? (value as CavemanLevel)
    : DEFAULT_TOKEN_SAVER_SETTINGS.cavemanLevel

// 规范化 Ponytail 档位；非法值回退默认档位。
const normalizePonytailLevel = (value: unknown): PonytailLevel =>
  typeof value === "string" && PONYTAIL_LEVEL_SET.has(value)
    ? (value as PonytailLevel)
    : DEFAULT_TOKEN_SAVER_SETTINGS.ponytailLevel

/**
 * 规范化 Token Saver 配置。
 */
export const normalizeTokenSaverSettings = (raw: unknown): TokenSaverSettings => {
  if (!isRecord(raw)) return DEFAULT_TOKEN_SAVER_SETTINGS

  const cavemanLevel = normalizeCavemanLevel(raw.cavemanLevel)
  return {
    rtkEnabled:
      typeof raw.rtkEnabled === "boolean"
        ? raw.rtkEnabled
        : DEFAULT_TOKEN_SAVER_SETTINGS.rtkEnabled,
    cavemanEnabled:
      typeof raw.cavemanEnabled === "boolean"
        ? raw.cavemanEnabled
        : DEFAULT_TOKEN_SAVER_SETTINGS.cavemanEnabled,
    cavemanLevel,
    ponytailEnabled:
      typeof raw.ponytailEnabled === "boolean"
        ? raw.ponytailEnabled
        : DEFAULT_TOKEN_SAVER_SETTINGS.ponytailEnabled,
    ponytailLevel: normalizePonytailLevel(raw.ponytailLevel),
  }
}

/**
 * 读取 Token Saver 配置。
 */
export const getTokenSaverSettings = (): TokenSaverSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  return normalizeTokenSaverSettings(rawConfig.tokenSaver)
}

/**
 * 保存 Token Saver 配置。
 */
export const saveTokenSaverSettings = (input: TokenSaverSettings): TokenSaverSettings => {
  const settings = normalizeTokenSaverSettings(input)
  updateRawConfig((rawConfig) => ({
    ...rawConfig,
    tokenSaver: settings,
  }))
  return settings
}
