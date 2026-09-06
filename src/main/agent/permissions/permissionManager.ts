import type {
  CollaborationMode,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  PermissionResponse,
  PermissionSettings,
  SandboxPolicy,
} from "@shared/contracts/agent"
import { normalizeCollaborationMode } from "@shared/contracts/agent"
import type { BeforeToolCallContext, BeforeToolCallResult } from "@/agent/core/types"
import { evaluateCommandSafety } from "@/agent/guard/commandSafetyGuard"
import { guardianEvaluator } from "@/agent/guard/guardianEvaluator"
import { getPermissionSettings, savePermissionSettings } from "@/services/settingsService"
import { EXEMPT_TOOLS, GATED_BUILTIN_TOOLS, matchRule, type ParsedRule, parseRule } from "./rule"

// 拒绝语义的固定 reason（回灌模型的 error toolResult 文案）。
const DENY_RULE_REASON = "Action denied by permission rules."
const USER_DENY_REASON = "Action denied by user."
const PLAN_MODE_MUTATION_REASON =
  "Action denied: Current collaboration mode is Plan Mode. Mutating actions (write, edit, apply_patch, todowrite) and modifying filesystem state are strictly prohibited in Plan Mode. Please finalize your plan using <proposed_plan> tags."
const REVIEW_MODE_MUTATION_REASON =
  "Action denied: Current collaboration mode is Review Mode (Read-Only Audit). Mutating actions (write, edit, apply_patch, todowrite) are strictly prohibited in Review Mode. Please output structured findings using <review_findings> tags."
const READ_ONLY_SANDBOX_REASON =
  "Action denied: Current sandbox policy is read-only. File modifications and write operations are strictly prohibited."

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

// 生成面板单行展示摘要。
const summarize = (toolName: string, args: unknown): string => {
  const record = isRecord(args) ? args : {}
  if (toolName === "bash" && typeof record.command === "string") return record.command
  if (
    (toolName === "write" || toolName === "edit" || toolName === "apply_patch") &&
    typeof record.path === "string"
  ) {
    return `${toolName} ${record.path}`
  }
  const json = JSON.stringify(args ?? {})
  return json.length > 96 ? `${json.slice(0, 96)}...` : json
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

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
  // 当前激活的 MCP 工具全名。
  private mcpTools = new Set<string>()

  // 会话白名单：工具、命令前缀、文件路径
  private sessionAllowed = new Map<string, Set<string>>()
  private sessionAllowedPrefixes = new Map<string, Set<string>>()
  private sessionAllowedPaths = new Map<string, Set<string>>()
  private sessionAllowAll = new Set<string>()

  // 挂起的权限请求
  private pending = new Map<
    string,
    {
      resolve: (decision: PermissionDecision & { prefix?: string }) => void
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

  // 注入 MCP 工具全名集合。
  setMcpTools(names: string[]): void {
    this.mcpTools = new Set(names)
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
   * 记录会话内已允许的命令前缀规则。
   */
  allowPrefixForSession(sessionId: string, prefix: string): void {
    const trimmed = prefix.trim()
    if (!trimmed) return
    let prefixes = this.sessionAllowedPrefixes.get(sessionId)
    if (!prefixes) {
      prefixes = new Set()
      this.sessionAllowedPrefixes.set(sessionId, prefixes)
    }
    prefixes.add(trimmed)
  }

  /**
   * 记录会话内已允许的文件路径。
   */
  allowPathForSession(sessionId: string, path: string): void {
    const trimmed = path.trim()
    if (!trimmed) return
    let paths = this.sessionAllowedPaths.get(sessionId)
    if (!paths) {
      paths = new Set()
      this.sessionAllowedPaths.set(sessionId, paths)
    }
    paths.add(trimmed)
  }

  /**
   * 检查指定工具是否在会话白名单中。
   */
  isToolAllowedInSession(sessionId: string, toolName: string): boolean {
    return this.sessionAllowed.get(sessionId)?.has(toolName) ?? false
  }

  /**
   * 检查指定命令是否匹配会话前缀白名单。
   */
  isPrefixAllowedInSession(sessionId: string, command: string): boolean {
    const prefixes = this.sessionAllowedPrefixes.get(sessionId)
    if (!prefixes) return false
    const trimmedCmd = command.trim()
    for (const prefix of prefixes) {
      if (
        trimmedCmd === prefix ||
        trimmedCmd.startsWith(`${prefix} `) ||
        trimmedCmd.startsWith(`${prefix}&&`)
      ) {
        return true
      }
    }
    return false
  }

  /**
   * 检查指定路径是否匹配会话路径白名单。
   */
  isPathAllowedInSession(sessionId: string, targetPath: string): boolean {
    const paths = this.sessionAllowedPaths.get(sessionId)
    if (!paths) return false
    const trimmed = targetPath.trim()
    for (const p of paths) {
      if (trimmed === p || trimmed.startsWith(p)) {
        return true
      }
    }
    return false
  }

  /**
   * 同步判定一次工具调用的处理方式。
   */
  evaluate(
    toolName: string,
    args: unknown,
    contextOptions?: { collaborationMode?: CollaborationMode; sessionId?: string },
  ): "allow" | "deny" | "ask" {
    const mode = this.settings.defaultMode
    const sandboxPolicy = this.settings.sandboxPolicy ?? "workspace-write"
    const collaborationMode = normalizeCollaborationMode(
      contextOptions?.collaborationMode ?? this.settings.collaborationMode,
    )
    const sessionId = contextOptions?.sessionId

    const record = isRecord(args) ? args : {}

    // 1. 协作模式 (Plan / Review Mode)：严禁任何写文件/编辑/修改操作与 todowrite 任务清单
    if (collaborationMode === "plan" || collaborationMode === "review") {
      if (
        toolName === "write" ||
        toolName === "edit" ||
        toolName === "apply_patch" ||
        toolName === "todowrite"
      ) {
        return "deny"
      }
    }

    // 2. 只读沙箱策略 (read-only)：严禁任何写文件/编辑/修改操作
    if (sandboxPolicy === "read-only") {
      if (toolName === "write" || toolName === "edit" || toolName === "apply_patch") {
        return "deny"
      }
    }

    // 3. 指令安全检测：破坏性高危指令绝对阻断 (Deny)
    if (toolName === "bash" && typeof record.command === "string") {
      const safety = evaluateCommandSafety(record.command)
      if (safety.level === "dangerous") {
        return "deny"
      }
    }

    // 4. deny 规则绝对优先
    if (matchRule(this.parsed.deny, toolName, args)) return "deny"

    // 5. Guardian 风险评估器检测 (在 Plan / Review 模式下高危硬阻断；在 Build 模式下高危强制升级为 ask)
    const guardianAssessment = guardianEvaluator.evaluateAction({
      toolName,
      args: record,
    })

    if (guardianAssessment.riskLevel === "critical" || guardianAssessment.riskLevel === "high") {
      if (collaborationMode === "plan" || collaborationMode === "review") {
        return "deny"
      }
      // 在 Build 模式下，即使处于 bypassPermissions，高危风险也强制升级为 ask (人工审批)
      return "ask"
    }

    // 6. 检查会话白名单
    if (sessionId) {
      if (this.sessionAllowAll.has(sessionId)) return "allow"
      if (this.isToolAllowedInSession(sessionId, toolName)) return "allow"
      if (
        toolName === "bash" &&
        typeof record.command === "string" &&
        this.isPrefixAllowedInSession(sessionId, record.command)
      ) {
        return "allow"
      }
      if (
        (toolName === "write" || toolName === "edit" || toolName === "apply_patch") &&
        typeof record.path === "string" &&
        this.isPathAllowedInSession(sessionId, record.path)
      ) {
        return "allow"
      }
    }

    // 7. 豁免工具与全局绕过
    if (mode === "bypassPermissions" || sandboxPolicy === "danger-full-access") return "allow"
    if (EXEMPT_TOOLS.has(toolName)) return "allow"
    if (!GATED_BUILTIN_TOOLS.has(toolName) && !this.mcpTools.has(toolName)) return "allow"

    // 8. 敏感指令提升为 ask
    if (toolName === "bash" && typeof record.command === "string") {
      const safety = evaluateCommandSafety(record.command)
      if (safety.level === "sensitive") {
        return "ask"
      }
    }

    // 9. 规则匹配
    const kind = matchRule(this.parsed.ask, toolName, args)
      ? "ask"
      : matchRule(this.parsed.allow, toolName, args)
        ? "allow"
        : null
    if (kind) return kind

    // 10. acceptEdits 模式下自动放行文件修改类工具
    if (
      mode === "acceptEdits" &&
      (toolName === "write" || toolName === "edit" || toolName === "apply_patch")
    ) {
      return "allow"
    }

    return "ask"
  }

  /**
   * beforeToolCall 门控：同步放行/拒绝，或挂起等待用户确认。不得 throw。
   */
  async gate(
    context: BeforeToolCallContext,
    sessionId: string | null,
    signal?: AbortSignal,
    options?: { collaborationMode?: CollaborationMode },
  ): Promise<BeforeToolCallResult | undefined> {
    const toolName = context.toolCall.name
    const args = context.args
    const collaborationMode = normalizeCollaborationMode(
      options?.collaborationMode ?? this.settings.collaborationMode,
    )
    const record = isRecord(args) ? args : {}

    // Guardian 评估
    const guardianAssessment = guardianEvaluator.evaluateAction({
      toolName,
      args: record,
    })

    // Plan Mode 门控硬拦截
    if (collaborationMode === "plan") {
      if (
        toolName === "write" ||
        toolName === "edit" ||
        toolName === "apply_patch" ||
        toolName === "todowrite"
      ) {
        return { block: true, reason: PLAN_MODE_MUTATION_REASON }
      }
      if (guardianAssessment.riskLevel === "critical" || guardianAssessment.riskLevel === "high") {
        return {
          block: true,
          reason: `Action denied: Guardian risk detected [${guardianAssessment.category}] - ${guardianAssessment.rationale}`,
        }
      }
    }

    // Review Mode 门控硬拦截
    if (collaborationMode === "review") {
      if (
        toolName === "write" ||
        toolName === "edit" ||
        toolName === "apply_patch" ||
        toolName === "todowrite"
      ) {
        return { block: true, reason: REVIEW_MODE_MUTATION_REASON }
      }
      if (guardianAssessment.riskLevel === "critical" || guardianAssessment.riskLevel === "high") {
        return {
          block: true,
          reason: `Action denied: Guardian risk detected in Review Mode [${guardianAssessment.category}] - ${guardianAssessment.rationale}`,
        }
      }
    }

    const decision = this.evaluate(toolName, args, {
      collaborationMode,
      sessionId: sessionId ?? undefined,
    })
    if (decision === "allow") return undefined
    if (decision === "deny") {
      const sandboxPolicy = this.settings.sandboxPolicy ?? "workspace-write"
      if (
        collaborationMode === "plan" &&
        (toolName === "write" ||
          toolName === "edit" ||
          toolName === "apply_patch" ||
          toolName === "todowrite")
      ) {
        return { block: true, reason: PLAN_MODE_MUTATION_REASON }
      }
      if (
        collaborationMode === "review" &&
        (toolName === "write" ||
          toolName === "edit" ||
          toolName === "apply_patch" ||
          toolName === "todowrite")
      ) {
        return { block: true, reason: REVIEW_MODE_MUTATION_REASON }
      }
      if (
        sandboxPolicy === "read-only" &&
        (toolName === "write" || toolName === "edit" || toolName === "apply_patch")
      ) {
        return { block: true, reason: READ_ONLY_SANDBOX_REASON }
      }
      if (toolName === "bash" && typeof record.command === "string") {
        const safety = evaluateCommandSafety(record.command)
        if (safety.level === "dangerous" && safety.reason) {
          return { block: true, reason: safety.reason }
        }
      }
      return { block: true, reason: DENY_RULE_REASON }
    }

    // 无推送目标（未接线）时按拒绝处理（fail-safe）。
    if (!this.sendRequest) return { block: true, reason: USER_DENY_REASON }

    const requestId = `${sessionId ?? "global"}:${context.toolCall.id}:${++this.requestSequence}`
    const outcome = await new Promise<PermissionDecision & { prefix?: string }>((resolve) => {
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

    if (outcome.decision === "deny") return { block: true, reason: USER_DENY_REASON }
    if (outcome.allowAll && sessionId) {
      this.sessionAllowAll.add(sessionId)
    } else if (outcome.rememberForSession && sessionId) {
      this.rememberForSession(sessionId, toolName)
    } else if (outcome.prefix && sessionId) {
      this.allowPrefixForSession(sessionId, outcome.prefix)
    }
    return undefined
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
      prefix: response.prefix,
      allowAll: response.allowAll === true,
    })
    return true
  }

  // 永久决策写回配置。
  private persistRule(kind: "allow" | "deny", toolName: string, args: unknown): void {
    const rule = formatRule(toolName, args)
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
    this.sessionAllowedPrefixes.delete(sessionId)
    this.sessionAllowedPaths.delete(sessionId)
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

// 格式化规则
const formatRule = (toolName: string, args: unknown): string => {
  const record = isRecord(args) ? args : {}
  const capitalized = toolName.charAt(0).toUpperCase() + toolName.slice(1)
  if (toolName === "bash" && typeof record.command === "string") {
    return `Bash(${record.command})`
  }
  if (
    (toolName === "write" || toolName === "edit" || toolName === "apply_patch") &&
    typeof record.path === "string"
  ) {
    return `${capitalized}(${record.path})`
  }
  if (toolName === "webfetch" && typeof record.url === "string") {
    return `WebFetch(${record.url})`
  }
  return `${capitalized}(${JSON.stringify(args ?? {})})`
}

export const permissionManager = new PermissionManager()
