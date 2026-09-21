import type { CapabilityPermissions } from "@shared/settings"
import { SUBAGENT_SKILL_TOOL_NAME, SUBAGENT_WEBSEARCH_TOOL_NAMES } from "@shared/settings"
import type { AgentTool } from "../core/types"
import { sanitizeMcpNameSegment } from "../mcp/mcpManager"

// MCP 工具全名前缀（`mcp__server__tool`）。
const MCP_PREFIX = "mcp__"

// 联网工具名集合（与 websearch 白名单字段同源）。
const WEBSEARCH_TOOL_NAMES: ReadonlySet<string> = new Set<string>(SUBAGENT_WEBSEARCH_TOOL_NAMES)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// 从 MCP 工具全名解析 server 名（与 mcpToolName 的 `mcp__server__tool` 格式对应）。
const mcpServerOf = (toolName: string): string | undefined => {
  if (!toolName.startsWith(MCP_PREFIX)) return undefined
  const rest = toolName.slice(MCP_PREFIX.length)
  const separator = rest.indexOf("__")
  return separator === -1 ? undefined : rest.slice(0, separator)
}

// 角色配置的 server 名按同一消毒规则归一后比较（与工具全名命名空间保持一致）。
const matchesMcpServer = (allowed: string[], toolName: string): boolean => {
  const server = mcpServerOf(toolName)
  if (server === undefined) return false
  return allowed.some((name) => sanitizeMcpNameSegment(name) === server)
}

/**
 * 单次工具调用是否命中能力权限：四组独立判定，字段缺省 = 不限制。
 * 子代理工具表过滤与协作模式门控共用同一语义（永不新增能力）。
 */
export const isToolAllowedByPermissions = (
  toolName: string,
  args: unknown,
  permissions: CapabilityPermissions | undefined,
): boolean => {
  if (!permissions) return true
  if (toolName.startsWith(MCP_PREFIX)) {
    if (permissions.mcp === undefined) return true
    return matchesMcpServer(permissions.mcp, toolName)
  }
  if (toolName === SUBAGENT_SKILL_TOOL_NAME) {
    if (permissions.skills === undefined) return true
    const requested = isRecord(args) ? args.name : undefined
    return typeof requested === "string" && permissions.skills.includes(requested)
  }
  if (WEBSEARCH_TOOL_NAMES.has(toolName)) {
    if (permissions.websearch === undefined) return true
    return permissions.websearch.includes(toolName)
  }
  if (permissions.tools === undefined) return true
  return permissions.tools.includes(toolName)
}

/**
 * 包装 read_skill：角色技能白名单未命中直接拒绝（保留原 cwd 与其余行为）。
 */
const withSkillAllowlist = (tool: AgentTool<any>, allowedSkills: string[]): AgentTool<any> => ({
  ...tool,
  execute: async (toolCallId, params, signal, onUpdate) => {
    const requested = (params as { name?: unknown }).name
    if (typeof requested !== "string" || !allowedSkills.includes(requested)) {
      return {
        content: [
          {
            type: "text",
            text: `Skill "${typeof requested === "string" ? requested : ""}" is not allowed for this sub-agent.`,
          },
        ],
        details: { error: "skill_not_allowed" },
      }
    }
    return tool.execute(toolCallId, params, signal, onUpdate)
  },
})

/**
 * 按角色权限过滤子代理工具集：四组独立求交，永不新增能力。
 * tools 组覆盖其余内置工具（含 task）；mcp 组按 server 名匹配；websearch 组管理联网工具；skills 组管理 read_skill。
 */
export const filterToolsByPermissions = (
  tools: AgentTool<any>[],
  permissions: CapabilityPermissions | undefined,
): AgentTool<any>[] => {
  if (!permissions) return tools
  return tools.flatMap((tool): AgentTool<any>[] => {
    if (tool.name === SUBAGENT_SKILL_TOOL_NAME && permissions.skills !== undefined) {
      if (permissions.skills.length === 0) return []
      return [withSkillAllowlist(tool, permissions.skills)]
    }
    return isToolAllowedByPermissions(tool.name, undefined, permissions) ? [tool] : []
  })
}
