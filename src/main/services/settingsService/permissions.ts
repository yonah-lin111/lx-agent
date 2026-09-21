import type {
  CapabilityPermissions,
  CollaborationMode,
  PermissionSettings,
} from "@shared/contracts/agent"
import { getModeBlockedTools } from "@shared/contracts/agent"
import { SUBAGENT_PERMISSION_TOOL_NAMES, SUBAGENT_WEBSEARCH_TOOL_NAMES } from "@shared/settings"

import { getConfigPath } from "@/paths"

import { isRecord, readRawConfig, updateRawConfig } from "./rawConfig"

// 权限配置默认值（缺失/损坏时回退，默认安全）。
const DEFAULT_PERMISSION_SETTINGS: PermissionSettings = {
  defaultMode: "default",
  sandboxPolicy: "workspace-write",
  allow: [],
  deny: [],
  ask: [],
}

// 合法协作模式（其余键丢弃）。
const COLLABORATION_MODES: readonly CollaborationMode[] = ["build", "plan", "review", "design"]
// 合法内置工具名与联网工具名（未知名称丢弃）。
const SUBAGENT_TOOL_NAMES: ReadonlySet<string> = new Set<string>(SUBAGENT_PERMISSION_TOOL_NAMES)
const WEBSEARCH_TOOL_NAMES: ReadonlySet<string> = new Set<string>(SUBAGENT_WEBSEARCH_TOOL_NAMES)

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []

// 去重去空白；白名单显式空数组保留（= 该组全禁）。
const normalizeList = (
  value: unknown,
  isValid: (item: string) => boolean,
): string[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const items: string[] = []
  const seen = new Set<string>()
  for (const item of toStringArray(value)) {
    const name = item.trim()
    if (!name || seen.has(name) || !isValid(name)) continue
    seen.add(name)
    items.push(name)
  }
  return items
}

// 规范化单个模式的能力权限：丢弃未知名称与模式硬拦截工具（配置永远不能放开硬基线）。
const normalizeModePermissions = (
  raw: unknown,
  mode: CollaborationMode,
): CapabilityPermissions | undefined => {
  if (!isRecord(raw)) return undefined
  const blockedTools = getModeBlockedTools(mode)
  const permissions: CapabilityPermissions = {}
  const tools = normalizeList(
    raw.tools,
    (name) => SUBAGENT_TOOL_NAMES.has(name) && !blockedTools.has(name),
  )
  if (tools !== undefined) permissions.tools = tools
  const mcp = normalizeList(raw.mcp, () => true)
  if (mcp !== undefined) permissions.mcp = mcp
  const skills = normalizeList(raw.skills, () => true)
  if (skills !== undefined) permissions.skills = skills
  const websearch = normalizeList(raw.websearch, (name) => WEBSEARCH_TOOL_NAMES.has(name))
  if (websearch !== undefined) permissions.websearch = websearch
  return Object.keys(permissions).length > 0 ? permissions : undefined
}

// 规范化模式权限映射：空映射归并为 undefined（配置不落冗余空节点）。
const normalizeModePermissionsMap = (
  raw: unknown,
): Partial<Record<CollaborationMode, CapabilityPermissions>> | undefined => {
  if (!isRecord(raw)) return undefined
  const modes: Partial<Record<CollaborationMode, CapabilityPermissions>> = {}
  for (const mode of COLLABORATION_MODES) {
    const permissions = normalizeModePermissions(raw[mode], mode)
    if (permissions) modes[mode] = permissions
  }
  return Object.keys(modes).length > 0 ? modes : undefined
}

/**
 * 规范化权限配置：校验 defaultMode 枚举与规则数组；非法值回退默认，不抛错。
 * 规则字符串格式在权限引擎解析时校验（非法条目跳过并记警告）。
 */
const normalizePermissionSettings = (raw: unknown): PermissionSettings => {
  if (!isRecord(raw)) return DEFAULT_PERMISSION_SETTINGS
  const mode = raw.defaultMode
  const defaultMode = mode === "acceptEdits" || mode === "bypassPermissions" ? mode : "default"
  const policy = raw.sandboxPolicy
  const sandboxPolicy =
    policy === "read-only" || policy === "danger-full-access" || policy === "workspace-write"
      ? policy
      : "workspace-write"
  const settings: PermissionSettings = {
    defaultMode,
    sandboxPolicy,
    allow: toStringArray(raw.allow),
    deny: toStringArray(raw.deny),
    ask: toStringArray(raw.ask),
  }
  const modes = normalizeModePermissionsMap(raw.modes)
  if (modes) settings.modes = modes
  return settings
}

/**
 * 读取 Agent 权限配置（缺失/损坏回退默认）。
 */
export const getPermissionSettings = (): PermissionSettings => {
  const rawConfig = readRawConfig(getConfigPath())
  const rawAgent = isRecord(rawConfig.agent) ? rawConfig.agent : {}
  return normalizePermissionSettings(rawAgent.permissions)
}

/**
 * 保存 Agent 权限配置，合并 agent.permissions 节点并保留其他字段（含 agent.mcp）。
 */
export const savePermissionSettings = (input: PermissionSettings): PermissionSettings => {
  const settings = normalizePermissionSettings(input)
  updateRawConfig((rawConfig) => {
    const rawAgentObj = isRecord(rawConfig.agent) ? { ...rawConfig.agent } : {}
    return {
      ...rawConfig,
      agent: {
        ...rawAgentObj,
        permissions: settings,
      },
    }
  })

  return settings
}
