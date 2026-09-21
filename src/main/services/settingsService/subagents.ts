import type { SubagentCapabilityCatalog, SubagentSettings } from "@shared/settings"
import { SUBAGENT_PERMISSION_TOOL_NAMES } from "@shared/settings"

import { resolveCwd } from "@/agent/cwdResolver"
import { mcpManager } from "@/agent/mcp/mcpManager"
import { skillLoader } from "@/agent/skills/skillLoader"
import { resolveAgentRoles } from "@/agent/subagent/agentRoles"
import { readSubagentSettings, validateSubagentSettings } from "@/agent/subagent/subagentConfig"
import { getConfigPath } from "@/paths"

import { isRecord, readRawConfig, updateRawConfig } from "./rawConfig"
import { getSkillSettings } from "./skills"

/**
 * 读取 Agent 子代理角色配置（非法条目告警并忽略）。
 */
export const getSubagentSettings = (): SubagentSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  const rawAgent = isRecord(rawConfig.agent) ? rawConfig.agent : {}
  return readSubagentSettings(rawAgent.subagents)
}

/**
 * 子代理权限编辑器能力目录：内置工具、已登记 MCP server（含连接状态）、已发现 skill（含禁用状态）、子代理角色。
 */
export const getSubagentCapabilityCatalog = (): SubagentCapabilityCatalog => {
  const statuses = new Map(mcpManager.getStatus().map((item) => [item.name, item.status]))
  const servers = Object.keys(mcpManager.getServers())
  const mcp = servers
    .map((name) => ({ name, connected: statuses.get(name) === "connected" }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const disabled = new Set(getSkillSettings().disabled)
  const skills = skillLoader
    .load(resolveCwd())
    .map((skill) => ({ name: skill.name, disabled: disabled.has(skill.name) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const subagents = [...resolveAgentRoles(getSubagentSettings()).values()].map((role) => ({
    name: role.name,
    builtIn: role.builtIn,
    ...(role.permissions !== undefined ? { permissions: role.permissions } : {}),
  }))

  return {
    tools: [...SUBAGENT_PERMISSION_TOOL_NAMES],
    mcp,
    skills,
    subagents,
  }
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
