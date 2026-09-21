import type {
  CollaborationMode,
  HookContextMessage,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  PermissionResponse,
  PermissionSettings,
  SandboxPolicy,
} from "@shared/contracts/agent"
import {
  getModeBlockedTools,
  MCP_TOOL_NAMESPACE,
  normalizeCollaborationMode,
  roleBlockedTools,
  withModePermissionDefaults,
} from "@shared/contracts/agent"
import { SUBAGENT_TASK_TOOL_NAME } from "@shared/settings"
import type { BeforeToolCallContext, BeforeToolCallResult } from "@/agent/core/types"
import { evaluateCommandSafety } from "@/agent/guard/commandSafetyGuard"
import { type GuardianAssessment, guardianEvaluator } from "@/agent/guard/guardianEvaluator"
import { firstPermissionDecision, hookResultMessages, hooksManager } from "@/agent/hooks"
import { type ResolvedAgentRole, resolveAgentRoles } from "@/agent/subagent/agentRoles"
import { isToolAllowedByPermissions, requestedTaskRoles } from "@/agent/subagent/toolPermissions"
import { parsePatch } from "@/agent/tools/applyPatchParser"
import {
  getPermissionSettings,
  getSubagentSettings,
  savePermissionSettings,
} from "@/services/settingsService"
import { EXEMPT_TOOLS, GATED_BUILTIN_TOOLS, matchRule, type ParsedRule, parseRule } from "./rule"

// 拒绝语义的固定 reason（回灌模型的 error toolResult 文案）。
const DENY_RULE_REASON = "Action denied by permission rules."
const USER_DENY_REASON = "Action denied by user."
const READ_ONLY_SANDBOX_REASON =
  "Action denied: Current sandbox policy is read-only. File modifications and write operations are strictly prohibited."
// 非 build 模式的写操作硬拦截 reason（模式身份约束，配置不可放开）。
const MODE_MUTATION_REASONS: Record<Exclude<CollaborationMode, "build">, string> = {
  plan: "Action denied: Current collaboration mode is Plan Mode. Mutating actions (write, edit, apply_patch, todowrite, memory) are strictly prohibited in Plan Mode. Sub-agent dispatch is limited to the configured role allow-list. Please finalize your plan using <proposed_plan> tags.",
  review:
    "Action denied: Current collaboration mode is Review Mode (Read-Only Audit). Mutating actions (write, edit, apply_patch, todowrite, memory) are strictly prohibited in Review Mode. Sub-agent dispatch is limited to the configured role allow-list. Please output structured findings using <review_findings> tags.",
  design:
    "Action denied: Current collaboration mode is Front Design Mode. Mutating actions (write, edit, apply_patch, todowrite, memory) and the wireframe tool are strictly prohibited in Design Mode. Sub-agent dispatch is limited to the configured role allow-list. Deliver prototypes using <front_design> tags instead.",
}
// 模式能力权限白名单未命中 reason。
const MODE_TOOL_NOT_ALLOWED_REASON =
  "Action denied: This tool is not allowed in the current collaboration mode by permission configuration."
// 子代理派发未命中角色白名单 reason（附允许角色，便于模型改用合法角色）。
const subagentNotAllowedReason = (allowed: readonly string[] | undefined): string =>
  `Action denied: Sub-agent dispatch in the current collaboration mode is restricted by permission configuration. Allowed roles: ${allowed && allowed.length > 0 ? allowed.join(", ") : "(none)"}.`
// 角色能力集含模式硬基线工具时的拒绝 reason（与 UI 的"永久禁用"锁定一致）。
const SUBAGENT_ROLE_DISABLED_REASON =
  "Action denied: Sub-agent role is permanently disabled in the current collaboration mode because its capability set includes blocked tools: "
// 父模式基线（子代理调用）拒绝前缀：明确约束来自父会话模式而非子代理自身模式。
const PARENT_BASELINE_PREFIX =
  "Action denied: Sub-agent tool use also inherits the parent session's collaboration mode restrictions. "
// 模式展示名（Guardian 拒绝文案）。
const MODE_LABELS: Record<CollaborationMode, string> = {
  build: "Build Mode",
  plan: "Plan Mode",
  review: "Review Mode",
  design: "Design Mode",
}

// read-only 沙箱策略下硬拦截的工具。
const READ_ONLY_BLOCKED_TOOLS = new Set(["write", "edit", "apply_patch"])
// 无会话上下文（全局）时的 MCP 工具集合键。
const GLOBAL_SESSION_KEY = "__global__"
// 未注册会话的回退空集合。
const EMPTY_MCP_TOOLS: ReadonlySet<string> = new Set()

// 将规则源解析为 ParsedRule[]，非法条目跳过并记警告。
const parseList = (sources: string[]): ParsedRule[] => {
  const rules: ParsedRule[] = []
  for (const source of sources) {
    const parsed = parseRule(source)
    if (parsed) {
      rules.push(parsed)
    } else {
      console.warn(`[permissions] 忽略非法权限规则: ${source}`)
    }
  }
  return rules
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// 解析 apply_patch 的目标路径；解析失败返回空数组（补丁报错仍由工具自身负责）。
const parsePatchPaths = (args: Record<string, unknown>): string[] => {
  if (typeof args.patch !== "string") return []
  try {
    return parsePatch(args.patch).actions.map((action) => action.path)
  } catch {
    return []
  }
}

// 计算本次调用的 Guardian 评估集：apply_patch 按目标路径逐个评估，其余工具单次评估。
const assessGuardian = (toolName: string, args: Record<string, unknown>): GuardianAssessment[] => {
  if (toolName === "apply_patch") {
    const paths = parsePatchPaths(args)
    if (paths.length > 0) {
      return paths.map((path) =>
        guardianEvaluator.evaluateAction({ toolName: "apply_patch", args: { path } }),
      )
    }
  }
  return [guardianEvaluator.evaluateAction({ toolName, args })]
}

// 判断评估集是否命中高危风险。
const hasHighRisk = (assessments: GuardianAssessment[]): boolean =>
  assessments.some(
    (assessment) => assessment.riskLevel === "critical" || assessment.riskLevel === "high",
  )

// 生成面板单行展示摘要。
const summarize = (toolName: string, args: unknown): string => {
  const record = isRecord(args) ? args : {}
  if (toolName === "bash" && typeof record.command === "string") return record.command
  if (toolName === "apply_patch") {
    const paths = parsePatchPaths(record)
    if (paths.length > 0) return `apply_patch ${paths.join(", ")}`
  }
  if ((toolName === "write" || toolName === "edit") && typeof record.path === "string") {
    return `${toolName} ${record.path}`
  }
  const json = JSON.stringify(args ?? {})
  return json.length > 96 ? `${json.slice(0, 96)}...` : json
}

/**
 * 工具执行权限管理器（main 进程单例）。
 *
 * 挂 agent-loop 的 beforeToolCall 钩子：结合 Guardian 风险评估、沙箱策略、多级审批策略与会话白名单。
 */
class PermissionManager {
  private settings: PermissionSettings = { defaultMode: "default", allow: [], deny: [], ask: [] }
  private parsed: { allow: ParsedRule[]; deny: ParsedRule[]; ask: ParsedRule[] } = {
    allow: [],
    deny: [],
    ask: [],
  }
  // 各会话的 MCP 工具全名集合（null 会话归入全局 key）。
  private mcpToolsBySession = new Map<string, Set<string>>()

  // 会话白名单：已允许的工具名
  private sessionAllowed = new Map<string, Set<string>>()
  private sessionAllowAll = new Set<string>()

  // 挂起的权限请求
  private pending = new Map<
    string,
    {
      resolve: (decision: PermissionDecision) => void
      toolName: string
      args: unknown
    }
  >()

  private sendRequest: ((request: PermissionRequest) => void) | null = null
  private requestSequence = 0

  /**
   * 读取最新权限配置。每次会话装配时调用。
   */
  load(): void {
    this.settings = getPermissionSettings()
    this.parsed = {
      allow: parseList(this.settings.allow),
      deny: parseList(this.settings.deny),
      ask: parseList(this.settings.ask),
    }
  }

  /**
   * 获取当前生效的沙箱策略
   */
  getSandboxPolicy(): SandboxPolicy {
    return this.settings.sandboxPolicy ?? "workspace-write"
  }

  /**
   * 获取当前生效的权限确认模式
   */
  getPermissionMode(): PermissionMode {
    return this.settings.defaultMode ?? "default"
  }

  /**
   * 设置权限确认模式
   */
  setPermissionMode(mode: PermissionMode): void {
    this.settings.defaultMode = mode
  }

  // 注入指定会话的 MCP 工具全名集合；sessionId 为 null 时归入全局集合。
  setMcpTools(sessionId: string | null, names: string[]): void {
    this.mcpToolsBySession.set(sessionId ?? GLOBAL_SESSION_KEY, new Set(names))
  }

  // 查询指定会话的 MCP 工具集合；未注册会话回退空集。
  private getMcpTools(sessionId?: string): ReadonlySet<string> {
    return this.mcpToolsBySession.get(sessionId ?? GLOBAL_SESSION_KEY) ?? EMPTY_MCP_TOOLS
  }

  // 注入权限请求推送目标。
  attachSender(sender: (request: PermissionRequest) => void): void {
    this.sendRequest = sender
  }

  /**
   * 记录会话内已允许的工具名。
   */
  rememberForSession(sessionId: string, toolName: string): void {
    let allowed = this.sessionAllowed.get(sessionId)
    if (!allowed) {
      allowed = new Set()
      this.sessionAllowed.set(sessionId, allowed)
    }
    allowed.add(toolName)
  }

  /**
   * 检查指定工具是否在会话白名单中。
   */
  isToolAllowedInSession(sessionId: string, toolName: string): boolean {
    return this.sessionAllowed.get(sessionId)?.has(toolName) ?? false
  }

  /**
   * 同步判定一次工具调用的处理方式。
   */
  evaluate(
    toolName: string,
    args: unknown,
    contextOptions?: {
      collaborationMode?: CollaborationMode
      parentMode?: CollaborationMode
      sessionId?: string
    },
  ): "allow" | "deny" | "ask" {
    const record = isRecord(args) ? args : {}
    return this.decide(toolName, args, contextOptions, assessGuardian(toolName, record)).decision
  }

  /**
   * 内部判定：复用调用方已计算的 Guardian 评估集，避免同一调用重复评估。
   * 拒绝时直接携带固定 reason（gate 透传，不再二次判定原因）。
   */
  private decide(
    toolName: string,
    args: unknown,
    contextOptions:
      | {
          collaborationMode?: CollaborationMode
          parentMode?: CollaborationMode
          sessionId?: string
        }
      | undefined,
    guardianAssessments: GuardianAssessment[],
  ): { decision: "allow" | "deny" | "ask"; reason?: string } {
    const mode = this.settings.defaultMode
    const sandboxPolicy = this.settings.sandboxPolicy ?? "workspace-write"
    const collaborationMode = normalizeCollaborationMode(
      contextOptions?.collaborationMode ?? this.settings.collaborationMode,
    )
    const parentMode = contextOptions?.parentMode
    const sessionId = contextOptions?.sessionId

    const record = isRecord(args) ? args : {}

    // 1. 协作模式硬基线：非 build 模式严禁写操作、todowrite 任务清单与 memory 写入；design 另禁 wireframe。
    //    该基线为模式身份约束，权限配置不可放开；子代理调用传入 parentMode 时父模式基线同样生效。
    for (const baselineMode of [collaborationMode, parentMode]) {
      if (baselineMode === undefined || baselineMode === "build") continue
      if (getModeBlockedTools(baselineMode).has(toolName)) {
        const reason =
          baselineMode === collaborationMode
            ? MODE_MUTATION_REASONS[baselineMode]
            : `${PARENT_BASELINE_PREFIX}${MODE_MUTATION_REASONS[baselineMode]}`
        return { decision: "deny", reason }
      }
    }

    // 1.1 模式能力权限白名单：五组独立判定，配置只能收紧、永不新增能力
    //     （非 build 模式的 subagents 组缺省回退探索子代理）
    //     子代理派发时父模式的角色白名单同样生效：嵌套派发不能绕过父模式约束。
    const whitelistModes =
      toolName === SUBAGENT_TASK_TOOL_NAME &&
      parentMode !== undefined &&
      parentMode !== collaborationMode
        ? [collaborationMode, parentMode]
        : [collaborationMode]
    for (const whitelistMode of whitelistModes) {
      const permissions = withModePermissionDefaults(
        whitelistMode,
        this.settings.modes?.[whitelistMode],
      )
      if (!isToolAllowedByPermissions(toolName, args, permissions)) {
        return {
          decision: "deny",
          reason:
            toolName === SUBAGENT_TASK_TOOL_NAME
              ? subagentNotAllowedReason(permissions?.subagents)
              : MODE_TOOL_NOT_ALLOWED_REASON,
        }
      }
    }

    // 1.2 角色兼容性：能力集含模式硬基线工具的角色在非 build 模式永久禁用（UI 同步锁定，不可放开）
    if (toolName === SUBAGENT_TASK_TOOL_NAME) {
      const blockedRoles = this.inspectDispatchRoles(args, [collaborationMode, parentMode])
      if (blockedRoles) return { decision: "deny", reason: blockedRoles }
    }

    // 2. 只读沙箱策略 (read-only)：严禁任何写文件/编辑/修改操作
    if (sandboxPolicy === "read-only" && READ_ONLY_BLOCKED_TOOLS.has(toolName)) {
      return { decision: "deny", reason: READ_ONLY_SANDBOX_REASON }
    }

    // 3. 指令安全检测：破坏性高危指令绝对阻断 (Deny)
    if (toolName === "bash" && typeof record.command === "string") {
      const safety = evaluateCommandSafety(record.command)
      if (safety.level === "dangerous") {
        return { decision: "deny", reason: safety.reason ?? DENY_RULE_REASON }
      }
    }

    // 4. deny 规则绝对优先
    if (matchRule(this.parsed.deny, toolName, args)) {
      return { decision: "deny", reason: DENY_RULE_REASON }
    }

    // 5. Guardian 风险评估：任一路径高危时非 build 模式硬阻断；build 强制升级为 ask (人工审批，
    //    即使处于 bypassPermissions 也生效；apply_patch 已按目标路径逐个评估)
    if (hasHighRisk(guardianAssessments)) {
      if (collaborationMode !== "build") {
        const assessment = guardianAssessments.find(
          (item) => item.riskLevel === "critical" || item.riskLevel === "high",
        )
        return {
          decision: "deny",
          reason: `Action denied: Guardian risk detected in ${MODE_LABELS[collaborationMode]} [${assessment?.category ?? "unknown"}] - ${assessment?.rationale ?? "high risk action"}`,
        }
      }
      return { decision: "ask" }
    }

    // 6. 检查会话白名单（工具级）
    if (sessionId) {
      if (this.sessionAllowAll.has(sessionId)) return { decision: "allow" }
      if (this.isToolAllowedInSession(sessionId, toolName)) return { decision: "allow" }
    }

    // 7. 豁免工具与全局绕过；已注册 MCP 工具优先于豁免判定，永远走门控，不得借豁免名绕过
    if (mode === "bypassPermissions" || sandboxPolicy === "danger-full-access") {
      return { decision: "allow" }
    }
    // 命名空间前缀兜底：即使会话未注册 MCP 集合（如会话切换窗口），mcp__ 工具也永远走门控
    const isMcpTool =
      toolName.startsWith(MCP_TOOL_NAMESPACE) || this.getMcpTools(sessionId).has(toolName)
    if (!isMcpTool && EXEMPT_TOOLS.has(toolName)) return { decision: "allow" }
    if (!isMcpTool && !GATED_BUILTIN_TOOLS.has(toolName)) return { decision: "allow" }

    // 8. 敏感指令提升为 ask
    if (toolName === "bash" && typeof record.command === "string") {
      const safety = evaluateCommandSafety(record.command)
      if (safety.level === "sensitive") {
        return { decision: "ask" }
      }
    }

    // 9. 规则匹配
    const kind = matchRule(this.parsed.ask, toolName, args)
      ? "ask"
      : matchRule(this.parsed.allow, toolName, args)
        ? "allow"
        : null
    if (kind) return { decision: kind }

    // 10. acceptEdits 模式下自动放行文件修改类工具（高危路径已在第 5 步升级，不会走到这里）
    if (mode === "acceptEdits" && READ_ONLY_BLOCKED_TOOLS.has(toolName)) {
      return { decision: "allow" }
    }

    return { decision: "ask" }
  }

  /**
   * 子代理派发角色兼容性校验：能力集与任一非 build 模式硬基线冲突的角色永久禁用。
   * 返回拒绝 reason（列出冲突角色与工具）；全部兼容时返回 undefined。
   */
  private inspectDispatchRoles(
    args: unknown,
    dispatchModes: readonly (CollaborationMode | undefined)[],
  ): string | undefined {
    const baselineModes = dispatchModes.filter(
      (mode): mode is Exclude<CollaborationMode, "build"> => mode !== undefined && mode !== "build",
    )
    if (baselineModes.length === 0) return undefined

    const conflicts = new Map<string, string[]>()
    let roles: Map<string, ResolvedAgentRole> | undefined
    for (const roleName of requestedTaskRoles(args)) {
      for (const mode of baselineModes) {
        roles ??= resolveAgentRoles(getSubagentSettings())
        const blocked = roleBlockedTools(roles.get(roleName)?.permissions, mode)
        if (blocked.length > 0) conflicts.set(roleName, blocked)
      }
    }
    if (conflicts.size === 0) return undefined

    const detail = [...conflicts].map(([role, tools]) => `${role} (${tools.join(", ")})`).join("; ")
    return `${SUBAGENT_ROLE_DISABLED_REASON}${detail}.`
  }

  /**
   * beforeToolCall 门控：同步放行/拒绝，或挂起等待用户确认。不得 throw。
   */
  async gate(
    context: BeforeToolCallContext,
    sessionId: string | null,
    signal?: AbortSignal,
    options?: {
      collaborationMode?: CollaborationMode
      parentMode?: CollaborationMode
      cwd?: string
    },
  ): Promise<BeforeToolCallResult | undefined> {
    const toolName = context.toolCall.name
    const args = context.args
    const collaborationMode = normalizeCollaborationMode(
      options?.collaborationMode ?? this.settings.collaborationMode,
    )
    const parentMode = options?.parentMode
    const record = isRecord(args) ? args : {}

    // 单次 Guardian 评估：apply_patch 按目标路径逐个评估后透传给内部判定，避免重复评估。
    const guardianAssessments = assessGuardian(toolName, record)

    const decision = this.decide(
      toolName,
      args,
      {
        collaborationMode,
        ...(parentMode !== undefined ? { parentMode } : {}),
        sessionId: sessionId ?? undefined,
      },
      guardianAssessments,
    )
    if (decision.decision === "allow") return undefined
    if (decision.decision === "deny") {
      return { block: true, reason: decision.reason ?? DENY_RULE_REASON }
    }

    // PermissionRequest hook：仅在系统结论为 ask 且配置了 PermissionRequest hook 时异步介入；
    // 无 hook 时保持旧链路的同步行为（立即挂起审批 UI）。
    let hookMessages: HookContextMessage[] = []
    if (this.hasPermissionRequestHooks(sessionId)) {
      const hookOutcome = await this.dispatchPermissionRequest(
        toolName,
        args,
        sessionId,
        options?.cwd,
      )
      hookMessages = hookOutcome.messages
      if (hookOutcome.decision === "allow") {
        // 仅本次生效：不写永久规则、不写会话白名单/allowAll。
        return hookMessages.length > 0 ? { hookMessages } : undefined
      }
      if (hookOutcome.decision === "deny") {
        return {
          block: true,
          reason: hookOutcome.reason || "Action denied by hook.",
          ...(hookMessages.length > 0 ? { hookMessages } : {}),
        }
      }
    }

    // 无推送目标（未接线）时按拒绝处理（fail-safe）。
    if (!this.sendRequest) {
      return {
        block: true,
        reason: USER_DENY_REASON,
        ...(hookMessages.length > 0 ? { hookMessages } : {}),
      }
    }

    const requestId = `${sessionId ?? "global"}:${context.toolCall.id}:${++this.requestSequence}`
    const outcome = await new Promise<PermissionDecision>((resolve) => {
      const onAbort = (): void => {
        this.pending.delete(requestId)
        resolve({ decision: "deny" })
      }
      if (signal?.aborted) {
        onAbort()
        return
      }
      signal?.addEventListener("abort", onAbort, { once: true })
      this.pending.set(requestId, {
        resolve: (userDecision) => {
          signal?.removeEventListener("abort", onAbort)
          resolve(userDecision)
        },
        toolName,
        args,
      })
      this.sendRequest?.({
        requestId,
        toolName,
        args,
        summary: summarize(toolName, args),
        mode: this.settings.defaultMode,
        sessionId,
      })
    })

    if (outcome.decision === "deny") {
      return {
        block: true,
        reason: USER_DENY_REASON,
        ...(hookMessages.length > 0 ? { hookMessages } : {}),
      }
    }
    if (outcome.allowAll && sessionId) {
      this.sessionAllowAll.add(sessionId)
    } else if (outcome.rememberForSession && sessionId) {
      this.rememberForSession(sessionId, toolName)
    }
    return hookMessages.length > 0 ? { hookMessages } : undefined
  }

  // 是否存在生效的 PermissionRequest hook（无则保持审批链路的同步行为）。
  private hasPermissionRequestHooks(sessionId: string | null): boolean {
    try {
      return hooksManager.getHooks(sessionId).some((hook) => hook.event === "PermissionRequest")
    } catch {
      return false
    }
  }

  // 派发 PermissionRequest hook（失败 fail-open：回落 UI，绝不自动放行）。
  private async dispatchPermissionRequest(
    toolName: string,
    args: unknown,
    sessionId: string | null,
    cwd?: string,
  ): Promise<{ decision?: "allow" | "deny"; reason?: string; messages: HookContextMessage[] }> {
    try {
      const result = await hooksManager.dispatch({
        event: "PermissionRequest",
        sessionId,
        cwd: cwd ?? process.cwd(),
        permissionMode: this.settings.defaultMode,
        toolName,
        payload: {
          tool_name: toolName,
          tool_input: args,
        },
      })
      const decision = firstPermissionDecision(result)
      return {
        ...(decision
          ? {
              decision: decision.decision,
              ...(decision.reason ? { reason: decision.reason } : {}),
            }
          : {}),
        messages: hookResultMessages(result),
      }
    } catch {
      return { messages: [] }
    }
  }

  /**
   * 处理 renderer 的权限决策。
   */
  respond(response: PermissionResponse): boolean {
    const pending = this.pending.get(response.requestId)
    if (!pending) return false
    this.pending.delete(response.requestId)
    const { resolve, toolName, args } = pending

    if (response.permanent === true) {
      this.persistRule(response.decision === "deny" ? "deny" : "allow", toolName, args)
    }
    resolve({
      decision: response.decision === "deny" ? "deny" : "allow",
      rememberForSession: response.rememberForSession === true,
      allowAll: response.allowAll === true,
    })
    return true
  }

  // 永久决策写回配置。
  private persistRule(kind: "allow" | "deny", toolName: string, args: unknown): void {
    const rule = formatRule(toolName, args)
    // 无法安全表达为单条规则（如多目标路径 apply_patch）时不写永久规则。
    if (!rule) return
    const list = this.settings[kind]
    if (list.includes(rule)) return
    const next = savePermissionSettings({ ...this.settings, [kind]: [...list, rule] })
    this.settings = next
    this.parsed = {
      allow: parseList(next.allow),
      deny: parseList(next.deny),
      ask: parseList(next.ask),
    }
  }

  // 会话切换/结束时清理。
  clearSession(sessionId: string): void {
    this.sessionAllowed.delete(sessionId)
    this.sessionAllowAll.delete(sessionId)
    const prefix = `${sessionId}:`
    for (const [requestId, entry] of this.pending) {
      if (requestId.startsWith(prefix)) {
        this.pending.delete(requestId)
        entry.resolve({ decision: "deny" })
      }
    }
  }
}

// 格式化规则；apply_patch 仅支持单一目标路径，多路径或解析失败返回 null（不写永久规则）。
const formatRule = (toolName: string, args: unknown): string | null => {
  const record = isRecord(args) ? args : {}
  const capitalized = toolName.charAt(0).toUpperCase() + toolName.slice(1)
  if (toolName === "bash" && typeof record.command === "string") {
    return `Bash(${record.command})`
  }
  if (toolName === "apply_patch") {
    const paths = parsePatchPaths(record)
    return paths.length === 1 ? `apply_patch(${paths[0]})` : null
  }
  if ((toolName === "write" || toolName === "edit") && typeof record.path === "string") {
    return `${capitalized}(${record.path})`
  }
  if (toolName === "webfetch" && typeof record.url === "string") {
    return `WebFetch(${record.url})`
  }
  return `${capitalized}(${JSON.stringify(args ?? {})})`
}

export const permissionManager = new PermissionManager()
