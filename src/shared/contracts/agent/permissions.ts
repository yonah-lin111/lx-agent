// 权限与协作模式契约：权限三态、沙箱策略、请求/决策/响应与模式归一化。

import {
  SUBAGENT_PERMISSION_TOOL_NAMES,
  SUBAGENT_SKILL_TOOL_NAME,
  SUBAGENT_WEBSEARCH_TOOL_NAMES,
} from "@shared/settings"

// 权限确认模式（default / acceptEdits / bypassPermissions 三态）。
export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions"

// 协作模式（build / auto / plan / review / design / minimal，支持向后兼容 "default" 归一化为 "build"）。
// auto 为编排基础模式：模型经 switch_mode 工具自行切出有效模式（effectiveMode），退出只读模式需用户批准。
export type CollaborationMode = "build" | "auto" | "plan" | "review" | "design" | "minimal"

// 协作模式循环顺序（Shift+Tab 循环、设置页展示与默认模式选择共用同一来源）。
export const COLLABORATION_MODE_ORDER: readonly CollaborationMode[] = [
  "build",
  "auto",
  "plan",
  "review",
  "design",
  "minimal",
]

// switch_mode 工具可达的目标模式（auto 不可达自身，minimal 永久排除在 auto 编排之外）。
export const SWITCH_MODE_TARGETS = ["build", "plan", "review", "design"] as const

// 计算循环切换的下一个模式（末位回到首位）。
export const nextCollaborationMode = (mode: CollaborationMode): CollaborationMode => {
  const index = COLLABORATION_MODE_ORDER.indexOf(mode)
  return COLLABORATION_MODE_ORDER[(index + 1) % COLLABORATION_MODE_ORDER.length]
}

// 协作模式向后兼容与归一化辅助函数
export const normalizeCollaborationMode = (mode?: string | null): CollaborationMode => {
  return COLLABORATION_MODE_ORDER.find((item) => item === mode) ?? "build"
}

// 沙箱策略（read-only / workspace-write / danger-full-access 三态）。
export type SandboxPolicy = "read-only" | "workspace-write" | "danger-full-access"

// 能力权限分组：字段缺省 = 不限制；显式空数组 = 该组全禁；非空数组 = 白名单。
export interface CapabilityPermissions {
  // 内置工具白名单（不含 MCP / 联网组 / read_skill，各自归组管理）。
  tools?: string[]
  // MCP server 名称白名单，配置即拥有该 server 的全部工具。
  mcp?: string[]
  // skill 名称白名单（控制 read_skill 与技能注入）。
  skills?: string[]
  // 联网工具白名单（web_search / webfetch）。
  websearch?: string[]
  // 子代理角色白名单（task 的 agent_type，含批量 tasks[] 的每一项）；缺省 = 不限制。
  subagents?: string[]
}

// 非 build 协作模式的硬拦截工具：写文件/编辑、任务清单与项目记忆写入。
// 该基线是模式身份的一部分：权限配置只能在此基础上收紧，永远不可放开。
// 注：`task` 子代理派发不在硬基线内，由 `modes.<mode>.subagents` 白名单控制（非 build 缺省仅 explorer）。
export const MODE_BLOCKED_TOOLS: readonly string[] = [
  "write",
  "edit",
  "apply_patch",
  "todowrite",
  "memory",
]

// 模式附加硬拦截：Design Mode 禁用 wireframe（原型交付走 <front_design> 协议）。
const DESIGN_BLOCKED_TOOLS: readonly string[] = ["wireframe"]

// 只读有效模式（auto 编排下模型内联切换后的受约束态）：退出回 build 需用户批准。
export const READ_ONLY_EFFECTIVE_MODES: readonly CollaborationMode[] = ["plan", "review", "design"]

/**
 * 判定只读有效模式（plan / review / design）：auto 编排下模型不得自行退出，需用户审批。
 */
export const isReadOnlyEffectiveMode = (mode: CollaborationMode): boolean =>
  READ_ONLY_EFFECTIVE_MODES.includes(mode)

// Minimal Mode 工具白名单：终端 + 文件读写；搜索/列目录走 bash，其余工具一律硬拦截
// （fail-closed，新增工具默认被拦截）。有意偏离 dsh minimal 的 shell-only 基线（见 docs/agent/modes.md §6）。
const MINIMAL_ALLOWED_TOOLS: readonly string[] = ["bash", "read", "write", "edit"]

// 模式工具白名单集合（缺省 = 不限制）。
const MODE_ALLOWED_TOOL_SETS: Partial<Record<CollaborationMode, ReadonlySet<string>>> = {
  minimal: new Set(MINIMAL_ALLOWED_TOOLS),
}

// 角色能力集的工具全集（tools 组 + 联网组 + skill 工具）：白名单模式判定缺省能力集冲突用。
const ROLE_TOOL_UNIVERSE: readonly string[] = [
  ...SUBAGENT_PERMISSION_TOOL_NAMES,
  ...SUBAGENT_WEBSEARCH_TOOL_NAMES,
  SUBAGENT_SKILL_TOOL_NAME,
]

const EMPTY_TOOL_SET: ReadonlySet<string> = new Set()
const BASE_MODE_BLOCKED_TOOLS: ReadonlySet<string> = new Set(MODE_BLOCKED_TOOLS)
const MODE_BLOCKED_TOOL_SETS: Record<CollaborationMode, ReadonlySet<string>> = {
  build: EMPTY_TOOL_SET,
  // Auto 为编排基础模式，自身无模式硬基线（有效模式的门禁在切换后各自生效）。
  auto: EMPTY_TOOL_SET,
  plan: BASE_MODE_BLOCKED_TOOLS,
  review: BASE_MODE_BLOCKED_TOOLS,
  design: new Set([...MODE_BLOCKED_TOOLS, ...DESIGN_BLOCKED_TOOLS]),
  // Minimal 为白名单模式，无黑名单；限制由 getModeAllowedTools 承担。
  minimal: EMPTY_TOOL_SET,
}

/**
 * 计算某协作模式的硬拦截工具集合（黑名单语义；build / minimal 为空集）。
 */
export const getModeBlockedTools = (mode: CollaborationMode): ReadonlySet<string> =>
  MODE_BLOCKED_TOOL_SETS[mode]

/**
 * 计算某协作模式的工具白名单集合（缺省 = 不限制）。
 */
export const getModeAllowedTools = (mode: CollaborationMode): ReadonlySet<string> | undefined =>
  MODE_ALLOWED_TOOL_SETS[mode]

/**
 * 判定工具是否被协作模式硬基线拦截：白名单模式按白名单 fail-closed，其余按黑名单。
 * 该基线是模式身份的一部分：权限配置只能在此基础上收紧，永远不可放开。
 */
export const isToolBlockedByMode = (mode: CollaborationMode, toolName: string): boolean => {
  const allowed = MODE_ALLOWED_TOOL_SETS[mode]
  if (allowed) return !allowed.has(toolName)
  return MODE_BLOCKED_TOOL_SETS[mode].has(toolName)
}

// 非 build 模式缺省的子代理白名单：仅内置探索子代理（只读）；build 缺省不限制。
export const DEFAULT_MODE_SUBAGENT_ROLES: Partial<Record<CollaborationMode, readonly string[]>> = {
  plan: ["explorer"],
  review: ["explorer"],
  design: ["explorer"],
}

/**
 * 计算模式的有效能力权限：非 build 模式的 subagents 组缺省回退探索子代理（用户配置覆盖缺省）。
 * 主进程门控与渲染层摘要共用，避免两侧对缺省值的理解分叉。
 */
export const withModePermissionDefaults = (
  mode: CollaborationMode,
  permissions?: CapabilityPermissions,
): CapabilityPermissions | undefined => {
  const defaults = DEFAULT_MODE_SUBAGENT_ROLES[mode]
  if (defaults === undefined || permissions?.subagents !== undefined) return permissions
  return { ...permissions, subagents: [...defaults] }
}

/**
 * 角色能力集与模式硬基线的冲突工具：tools 组缺省 = 不限制全部内置工具，冲突集即模式硬基线全集。
 * 返回空数组表示该角色与模式兼容（可被该模式派发）；非空 = 该角色在此模式下永久禁用（UI 锁定 + 门控拒绝）。
 */
export const roleBlockedTools = (
  permissions: CapabilityPermissions | undefined,
  mode: CollaborationMode,
): string[] => {
  const allowed = getModeAllowedTools(mode)
  const tools = permissions?.tools
  if (tools === undefined) {
    // 白名单模式：缺省能力集（含白名单外工具）与模式冲突，冲突集为白名单之外的工具全集。
    if (allowed) return ROLE_TOOL_UNIVERSE.filter((tool) => !allowed.has(tool))
    const blocked = getModeBlockedTools(mode)
    return blocked.size === 0 ? [] : [...blocked]
  }
  return [...new Set(tools.filter((tool) => isToolBlockedByMode(mode, tool)))]
}

// 权限配置（~/.lx/config/agent.json 的 agent.permissions 节点）。
export interface PermissionSettings {
  defaultMode: PermissionMode
  sandboxPolicy?: SandboxPolicy
  collaborationMode?: CollaborationMode
  allow: string[]
  deny: string[]
  ask: string[]
  // 协作模式能力权限覆盖：缺省 = 不限制（仅受模式硬基线约束）；显式白名单只能收紧。
  modes?: Partial<Record<CollaborationMode, CapabilityPermissions>>
}

// 权限请求（main → renderer，命令面板展示）。
export interface PermissionRequest {
  requestId: string
  toolName: string
  args: unknown
  summary: string
  mode: PermissionMode
  sessionId: string | null
}

// 权限决策（不含 requestId；主进程挂起请求的内部语义）。
// allowAll：会话级"允许全部工具"，跳过规则与弹窗，随会话切换重置。
// permanent：写回配置 allow[]/deny[]（精确参数），同工具同参数后续不再询问/直接拒绝。
export type PermissionDecision = {
  decision: "allow" | "deny"
  rememberForSession?: boolean
  allowAll?: boolean
  permanent?: boolean
}

// 权限决策（renderer → main 响应负载）。
export interface PermissionResponse {
  requestId: string
  decision: "allow" | "deny"
  rememberForSession?: boolean
  allowAll?: boolean
  // 永久允许/拒绝写回配置（allowAll 不写回）。
  permanent?: boolean
}
