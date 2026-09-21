import type { CapabilityPermissions, ModelSelection, SubagentSettings } from "@shared/settings"
import { RESERVED_SUBAGENT_ROLE_NAMES, SUBAGENT_ROLE_NAME_PATTERN } from "@shared/settings"

// 运行时解析后的子代理角色模型。
export interface ResolvedAgentRole {
  name: string
  description: string
  instructions?: string
  model?: ModelSelection
  permissions?: CapabilityPermissions
  builtIn: boolean
}

// explorer 只读权限：仅只读工具 + 联网检索，禁用全部 skill 与写入/委托（未激活的工具名在装配时静默缺失，不新增能力）。
const EXPLORER_PERMISSIONS: CapabilityPermissions = {
  tools: ["read", "ls", "grep", "find", "lsp", "time"],
  websearch: ["web_search", "webfetch"],
  skills: [],
}

const EXPLORER_INSTRUCTIONS = [
  "You are a codebase explorer sub-agent. Answer the assigned codebase question accurately and concisely.",
  "- Read-only: never modify files; only use the provided read-only tools.",
  "- Gather evidence with targeted searches; cite exact file paths and line numbers in your answer.",
  "- Prefer specific, well-scoped answers; state uncertainty explicitly instead of guessing.",
  "- Trust existing exploration results; do not repeat work already covered.",
].join("\n")

const WORKER_INSTRUCTIONS = [
  "You are a worker sub-agent focused on execution and production work.",
  "- You own the assigned files/responsibility; keep changes scoped to your assignment.",
  "- Other agents may edit the codebase in parallel: never revert or rewrite their edits; adapt to them.",
  "- State intent before side-effecting tool calls; finish with a concise summary of changes and verification performed.",
].join("\n")

// 内置角色名（权限覆盖的合法键）。
export const BUILTIN_SUBAGENT_ROLE_NAMES = ["explorer", "worker"] as const

// 内置角色目录（固定顺序：explorer → worker）。
export const BUILT_IN_AGENT_ROLES: Record<string, ResolvedAgentRole> = {
  explorer: {
    name: "explorer",
    description:
      "Fast, authoritative answers to specific, well-scoped codebase questions. Use multiple explorers in parallel for independent questions.",
    instructions: EXPLORER_INSTRUCTIONS,
    permissions: EXPLORER_PERMISSIONS,
    builtIn: true,
  },
  worker: {
    name: "worker",
    description:
      "Execution and production work: implement part of a feature, fix tests or bugs, split large refactors into independent chunks.",
    instructions: WORKER_INSTRUCTIONS,
    builtIn: true,
  },
}

/**
 * 合并内置角色与用户角色：内置在前，用户角色按配置插入顺序追加。
 * 保留名或不符合名称规则的角色在此再次丢弃（防御纵深）；内置角色永不被遮蔽。
 * 内置角色仅允许权限覆盖（builtinPermissions），名称/描述/指令/模型始终取自内置定义。
 */
export const resolveAgentRoles = (settings: SubagentSettings): Map<string, ResolvedAgentRole> => {
  const resolved = new Map<string, ResolvedAgentRole>()
  for (const [name, role] of Object.entries(BUILT_IN_AGENT_ROLES)) {
    const override = settings.builtinPermissions?.[name]
    resolved.set(
      name,
      override === undefined ? role : { ...role, permissions: clonePermissions(override) },
    )
  }

  const reserved = new Set<string>(RESERVED_SUBAGENT_ROLE_NAMES)
  for (const [name, config] of Object.entries(settings.roles)) {
    if (reserved.has(name) || !SUBAGENT_ROLE_NAME_PATTERN.test(name)) continue
    const role: ResolvedAgentRole = {
      name,
      description: config.description,
      builtIn: false,
    }
    if (config.instructions !== undefined) role.instructions = config.instructions
    if (config.model !== undefined) role.model = config.model
    if (config.permissions !== undefined) {
      role.permissions = clonePermissions(config.permissions)
    }
    resolved.set(name, role)
  }
  return resolved
}

// 深拷贝权限配置，避免调用方后续改动污染角色目录。
const clonePermissions = (permissions: CapabilityPermissions): CapabilityPermissions => {
  const cloned: CapabilityPermissions = {}
  if (permissions.tools !== undefined) cloned.tools = [...permissions.tools]
  if (permissions.mcp !== undefined) cloned.mcp = [...permissions.mcp]
  if (permissions.skills !== undefined) cloned.skills = [...permissions.skills]
  if (permissions.websearch !== undefined) cloned.websearch = [...permissions.websearch]
  return cloned
}

// 描述单行化：折叠换行与连续空白；空描述回退占位文案。
const toSingleLine = (description: string): string => {
  const flattened = description.replace(/\s+/g, " ").trim()
  return flattened || "no description"
}

// 渲染 task 工具描述中的角色目录（顺序 = 输入迭代顺序）。
export const buildAgentTypesDescription = (roles: Iterable<ResolvedAgentRole>): string => {
  const lines = ["Available agent types:"]
  for (const role of roles) {
    lines.push(`- ${role.name}: ${toSingleLine(role.description)}`)
  }
  return lines.join("\n")
}
