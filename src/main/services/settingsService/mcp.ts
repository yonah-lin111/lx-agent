import { DEFAULT_MCP_SETTINGS, type McpServerConfig, type McpSettings } from "@shared/settings"

import { getConfigPath } from "@/paths"

import { isRecord, readRawConfig, updateRawConfig } from "./rawConfig"

/**
 * 规范化 MCP 配置。
 */
const normalizeMcpSettings = (raw: unknown): McpSettings => {
  if (!isRecord(raw)) return DEFAULT_MCP_SETTINGS

  const rawServers = isRecord(raw.servers) ? raw.servers : raw
  const servers: Record<string, McpServerConfig> = {}

  for (const [name, val] of Object.entries(rawServers)) {
    if (!isRecord(val)) continue
    const serverName = name.trim()
    if (!serverName) continue

    const command = Array.isArray(val.command)
      ? val.command.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      : []
    if (command.length === 0) continue

    const environment: Record<string, string> = {}
    if (isRecord(val.environment)) {
      for (const [envK, envV] of Object.entries(val.environment)) {
        if (typeof envK === "string" && envK.trim() && typeof envV === "string") {
          environment[envK.trim()] = envV
        }
      }
    }

    servers[serverName] = {
      command,
      ...(typeof val.cwd === "string" && val.cwd.trim() ? { cwd: val.cwd.trim() } : {}),
      ...(Object.keys(environment).length > 0 ? { environment } : {}),
      ...(typeof val.disabled === "boolean" ? { disabled: val.disabled } : {}),
      ...(typeof val.timeout === "number" && val.timeout > 0 ? { timeout: val.timeout } : {}),
    }
  }

  return { servers }
}

/**
 * 读取 MCP 设置。
 */
export const getMcpSettings = (): McpSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  const rawAgent = isRecord(rawConfig.agent) ? rawConfig.agent : {}
  return normalizeMcpSettings(rawAgent.mcp)
}

/**
 * 保存 MCP 设置。
 */
export const saveMcpSettings = (input: McpSettings): McpSettings => {
  const settings = normalizeMcpSettings(input)
  updateRawConfig((rawConfig) => {
    const rawAgentObj = isRecord(rawConfig.agent) ? { ...rawConfig.agent } : {}
    return {
      ...rawConfig,
      agent: {
        ...rawAgentObj,
        mcp: settings.servers,
      },
    }
  })

  return settings
}
