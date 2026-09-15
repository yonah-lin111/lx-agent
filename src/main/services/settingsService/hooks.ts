import type { HookSettings } from "@shared/settings"

import { hookConfig, readHookSettings, validateHookSettings } from "@/agent/hooks/hookConfig"
import { getConfigPath } from "@/paths"

import { isRecord, readRawConfig, updateRawConfig } from "./rawConfig"

/**
 * 读取 Agent 生命周期钩子配置（非法条目告警并忽略）。
 */
export const getHookSettings = (): HookSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  const rawAgent = isRecord(rawConfig.agent) ? rawConfig.agent : {}
  return readHookSettings(rawAgent.hooks)
}

/**
 * 保存 Agent 生命周期钩子配置：严格校验后整树覆盖 `agent.hooks`，保留其他字段。
 * 保存成功后只清共享草稿作用域缓存：新会话首发即用新配置，运行中会话不受影响。
 */
export const saveHookSettings = (input: HookSettings): HookSettings => {
  const settings = validateHookSettings(input)
  updateRawConfig((rawConfig) => {
    const rawAgentObj = isRecord(rawConfig.agent) ? { ...rawConfig.agent } : {}
    return {
      ...rawConfig,
      agent: {
        ...rawAgentObj,
        hooks: settings,
      },
    }
  })

  hookConfig.reset("global")
  return settings
}
