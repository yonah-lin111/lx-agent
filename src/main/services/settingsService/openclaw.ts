import {
  DEFAULT_OPENCLAW_SETTINGS,
  type OpenClawAgentItem,
  type OpenClawAuthMode,
  type OpenClawInstanceConfig,
  type OpenClawSettings,
} from "@shared/settings"

import { getConfigPath } from "@/paths"

import { isRecord, readRawConfig, updateRawConfig } from "./rawConfig"

/**
 * 规范化单个 OpenClaw Agent 条目。
 */
const normalizeOpenClawAgentItem = (raw: unknown): OpenClawAgentItem | null => {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === "string" ? raw.id.trim() : ""
  if (!id) return null

  const description = typeof raw.description === "string" ? raw.description.trim() : ""
  const workspace = typeof raw.workspace === "string" ? raw.workspace.trim() : ""
  const sessionKey = typeof raw.sessionKey === "string" ? raw.sessionKey.trim() : ""

  return {
    id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id,
    ...(description ? { description } : {}),
    ...(workspace ? { workspace } : {}),
    ...(typeof raw.isDefault === "boolean" ? { isDefault: raw.isDefault } : {}),
    ...(sessionKey ? { sessionKey } : {}),
  }
}

/**
 * 规范化单个 OpenClaw 实例配置；gatewayUrl 缺失视为非法实例。
 */
const normalizeOpenClawInstance = (raw: unknown): OpenClawInstanceConfig | null => {
  if (!isRecord(raw)) return null
  const gatewayUrl = typeof raw.gatewayUrl === "string" ? raw.gatewayUrl.trim() : ""
  if (!gatewayUrl) return null

  const token = typeof raw.token === "string" ? raw.token.trim() : ""
  const authMode: OpenClawAuthMode = raw.authMode === "device" ? "device" : "token"
  const agents = Array.isArray(raw.agents)
    ? raw.agents
        .map(normalizeOpenClawAgentItem)
        .filter((agent): agent is OpenClawAgentItem => agent !== null)
    : []

  return {
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : gatewayUrl,
    gatewayUrl,
    authMode,
    ...(token ? { token } : {}),
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    agents,
  }
}

/**
 * 规范化 OpenClaw 配置。
 */
export const normalizeOpenClawSettings = (raw: unknown): OpenClawSettings => {
  if (!isRecord(raw)) return { ...DEFAULT_OPENCLAW_SETTINGS }

  const instances: Record<string, OpenClawInstanceConfig> = {}
  if (isRecord(raw.instances)) {
    for (const [key, value] of Object.entries(raw.instances)) {
      const id = key.trim()
      if (!id) continue
      const instance = normalizeOpenClawInstance(value)
      if (instance) instances[id] = instance
    }
  }

  const rawDefaultInstanceId =
    typeof raw.defaultInstanceId === "string" ? raw.defaultInstanceId.trim() : ""
  const rawDefaultAgentId = typeof raw.defaultAgentId === "string" ? raw.defaultAgentId.trim() : ""

  return {
    instances,
    ...(rawDefaultInstanceId && instances[rawDefaultInstanceId]
      ? { defaultInstanceId: rawDefaultInstanceId }
      : {}),
    ...(rawDefaultAgentId ? { defaultAgentId: rawDefaultAgentId } : {}),
  }
}

/**
 * 读取 OpenClaw 配置。
 */
export const getOpenClawSettings = (): OpenClawSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  return normalizeOpenClawSettings(rawConfig.openclaw)
}

/**
 * 保存 OpenClaw 配置。
 */
export const saveOpenClawSettings = (input: OpenClawSettings): OpenClawSettings => {
  const settings = normalizeOpenClawSettings(input)
  updateRawConfig((rawConfig) => ({
    ...rawConfig,
    openclaw: settings,
  }))

  return settings
}
