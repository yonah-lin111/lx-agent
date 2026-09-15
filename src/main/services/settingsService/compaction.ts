import { type CompactionSettings, DEFAULT_COMPACTION_SETTINGS } from "@shared/settings"

import { getConfigPath } from "@/paths"

import { clampPositiveInt, isRecord, type RawAiConfig, readRawConfig } from "./rawConfig"

/**
 * 读取上下文压缩配置（ai.compaction 节点）；缺失/非法字段回退默认值，不抛错。
 */
export const getCompactionSettings = (): CompactionSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  const rawAi = isRecord(rawConfig.ai) ? (rawConfig.ai as RawAiConfig) : {}
  const rawCompaction = isRecord(rawAi.compaction) ? rawAi.compaction : {}
  return {
    enabled: rawCompaction.enabled !== false,
    contextWindow: clampPositiveInt(
      rawCompaction.contextWindow,
      DEFAULT_COMPACTION_SETTINGS.contextWindow,
    ),
    keepRecentTokens: clampPositiveInt(
      rawCompaction.keepRecentTokens,
      DEFAULT_COMPACTION_SETTINGS.keepRecentTokens,
    ),
    reserveTokens: clampPositiveInt(
      rawCompaction.reserveTokens,
      DEFAULT_COMPACTION_SETTINGS.reserveTokens,
    ),
  }
}
