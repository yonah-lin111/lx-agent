import type { PermissionSettings } from "@shared/contracts/agent"

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
  const toStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
  return {
    defaultMode,
    sandboxPolicy,
    allow: toStringArray(raw.allow),
    deny: toStringArray(raw.deny),
    ask: toStringArray(raw.ask),
  }
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
