import type { ModelSelection, SubagentRoleConfig, SubagentSettings } from "@shared/settings"
import {
  RESERVED_SUBAGENT_ROLE_NAMES,
  SUBAGENT_MAX_CONCURRENCY_LIMIT,
  SUBAGENT_MAX_DEPTH_LIMIT,
  SUBAGENT_ROLE_NAME_PATTERN,
} from "@shared/settings"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// 安全描述非法值（JSON.stringify 对 BigInt/循环引用会抛出）。
const describeValue = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return typeof value
  }
}

// 解析结果：规范化配置与非法条目说明。
export interface SubagentSettingsParseResult {
  settings: SubagentSettings
  errors: string[]
}

// 缺省子代理配置（角色为空、深度为 1）。
const defaultSettings = (): SubagentSettings => ({ roles: {}, maxDepth: 1 })

/**
 * 解析模型选择：provider/model 必填，variant 可选；非法返回 error 并由调用方丢弃该字段。
 */
const parseModelSelection = (
  raw: unknown,
  label: string,
): { model?: ModelSelection; error?: string } => {
  if (raw === undefined) return {}
  if (!isRecord(raw)) return { error: `${label} 非法（须为对象）` }

  const provider = typeof raw.provider === "string" ? raw.provider.trim() : ""
  const model = typeof raw.model === "string" ? raw.model.trim() : ""
  if (!provider || !model) return { error: `${label} 非法（provider/model 不能为空）` }

  const rawVariant = raw.variant
  if (rawVariant !== undefined && typeof rawVariant !== "string") {
    return { error: `${label} 非法（variant 须为字符串）` }
  }
  const variant = typeof rawVariant === "string" ? rawVariant.trim() : ""
  return { model: { provider, model, ...(variant ? { variant } : {}) } }
}

/**
 * 解析单个角色条目：非法名称、保留名、空 description 或非对象条目返回 null（调用方跳过）。
 */
const parseRole = (name: string, raw: unknown, errors: string[]): SubagentRoleConfig | null => {
  if (!SUBAGENT_ROLE_NAME_PATTERN.test(name)) {
    errors.push(`忽略非法角色名: ${name}`)
    return null
  }
  if ((RESERVED_SUBAGENT_ROLE_NAMES as readonly string[]).includes(name)) {
    errors.push(`保留角色名不可使用: ${name}`)
    return null
  }
  if (!isRecord(raw)) {
    errors.push(`忽略非法角色配置（须为对象）: ${name}`)
    return null
  }

  const description = typeof raw.description === "string" ? raw.description.trim() : ""
  if (!description) {
    errors.push(`角色 description 不能为空: ${name}`)
    return null
  }
  const role: SubagentRoleConfig = { description }

  if (raw.instructions !== undefined) {
    if (typeof raw.instructions !== "string") {
      errors.push(`角色 instructions 须为字符串: ${name}`)
    } else {
      const instructions = raw.instructions.trim()
      if (instructions) role.instructions = instructions
    }
  }

  if (raw.tools !== undefined) {
    if (!Array.isArray(raw.tools)) {
      errors.push(`角色 tools 须为字符串数组: ${name}`)
    } else {
      const tools: string[] = []
      const seen = new Set<string>()
      for (const item of raw.tools) {
        if (typeof item !== "string" || !item.trim()) {
          errors.push(`忽略非法工具名（${name}）: ${describeValue(item)}`)
          continue
        }
        const tool = item.trim()
        if (seen.has(tool)) continue
        seen.add(tool)
        tools.push(tool)
      }
      // 空数组归一为缺省（继承父工具集）。
      if (tools.length > 0) role.tools = tools
    }
  }

  const parsedModel = parseModelSelection(raw.model, `角色 ${name} 的 model`)
  if (parsedModel.error) errors.push(parsedModel.error)
  else if (parsedModel.model) role.model = parsedModel.model

  return role
}

// 解析 maxDepth：整数 1–5，越界回退 1 并告警。
const parseMaxDepth = (raw: unknown, errors: string[]): number => {
  if (raw === undefined) return 1
  if (
    typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= 1 &&
    raw <= SUBAGENT_MAX_DEPTH_LIMIT
  ) {
    return raw
  }
  errors.push(`maxDepth 须为 1-${SUBAGENT_MAX_DEPTH_LIMIT} 的整数，已回退 1`)
  return 1
}

// 解析 maxConcurrent：整数 1–32，越界或缺失一律忽略（不限并发）并告警。
const parseMaxConcurrent = (raw: unknown, errors: string[]): number | undefined => {
  if (raw === undefined) return undefined
  if (
    typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= 1 &&
    raw <= SUBAGENT_MAX_CONCURRENCY_LIMIT
  ) {
    return raw
  }
  errors.push(`maxConcurrent 须为 1-${SUBAGENT_MAX_CONCURRENCY_LIMIT} 的整数，已忽略`)
  return undefined
}

/**
 * 解析 `agent.subagents` 原始配置：同时兼容 `{ roles, ... }` 域模型与裸角色映射表。
 * 非法条目记入 errors 且跳过，绝不抛出。
 */
export const parseSubagentSettings = (raw: unknown): SubagentSettingsParseResult => {
  if (raw === undefined || raw === null) return { settings: defaultSettings(), errors: [] }
  if (!isRecord(raw)) {
    return { settings: defaultSettings(), errors: ["agent.subagents 必须是对象，已忽略"] }
  }

  const errors: string[] = []
  let rolesRaw: Record<string, unknown>
  if (raw.roles === undefined) {
    rolesRaw = raw
  } else if (isRecord(raw.roles)) {
    rolesRaw = raw.roles
  } else {
    errors.push("roles 必须是对象，已忽略")
    rolesRaw = {}
  }

  const settings: SubagentSettings = { roles: {}, maxDepth: parseMaxDepth(raw.maxDepth, errors) }
  const maxConcurrent = parseMaxConcurrent(raw.maxConcurrent, errors)
  if (maxConcurrent !== undefined) settings.maxConcurrent = maxConcurrent

  const parsedDefaultModel = parseModelSelection(raw.defaultModel, "defaultModel")
  if (parsedDefaultModel.error) errors.push(parsedDefaultModel.error)
  else if (parsedDefaultModel.model) settings.defaultModel = parsedDefaultModel.model

  for (const [name, value] of Object.entries(rolesRaw)) {
    const role = parseRole(name, value, errors)
    if (role) settings.roles[name] = role
  }

  return { settings, errors }
}

/**
 * 读取 `agent.subagents` 设置模型：非法条目告警并忽略，缺失/损坏降级为默认。
 */
export const readSubagentSettings = (
  raw: unknown,
  warn: (message: string) => void = console.warn,
): SubagentSettings => {
  const { settings, errors } = parseSubagentSettings(raw)
  for (const message of errors) warn(`[subagents] ${message}`)
  return settings
}

/**
 * 保存前严格校验设置模型：任一非法条目即抛出（不写入坏配置）。
 */
export const validateSubagentSettings = (raw: unknown): SubagentSettings => {
  const { settings, errors } = parseSubagentSettings(raw)
  if (errors.length > 0) throw new Error(errors[0])
  return settings
}
