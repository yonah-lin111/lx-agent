import type { SubagentSettings } from "@shared/settings"

import { readSubagentSettings, validateSubagentSettings } from "@/agent/subagent/subagentConfig"
import { getConfigPath } from "@/paths"

import { isRecord, readRawConfig, updateRawConfig } from "./rawConfig"

/**
 * 读取 Agent 子代理角色配置（非法条目告警并忽略）。
 */
export const getSubagentSettings = (): SubagentSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  const rawAgent = isRecord(rawConfig.agent) ? rawConfig.agent : {}
  return readSubagentSettings(rawAgent.subagents)
}

/**
 * 保存 Agent 子代理角色配置：严格校验后整树覆盖 `agent.subagents`，保留其他字段。
 */
export const saveSubagentSettings = (input: SubagentSettings): SubagentSettings => {
  const settings = validateSubagentSettings(input)
  updateRawConfig((rawConfig) => {
    const rawAgentObj = isRecord(rawConfig.agent) ? { ...rawConfig.agent } : {}
    return {
      ...rawConfig,
      agent: {
        ...rawAgentObj,
        subagents: settings,
      },
    }
  })

  return settings
}
