import type {
  PermissionDecision,
  PermissionRequest,
  PermissionResponse,
  PermissionSettings,
} from "@shared/contracts/agent"
import type { BeforeToolCallContext, BeforeToolCallResult } from "@/agent/core/types"
import { evaluateCommandSafety } from "@/agent/guard/commandSafetyGuard"
import { getPermissionSettings, savePermissionSettings } from "@/services/settingsService"
import { EXEMPT_TOOLS, GATED_BUILTIN_TOOLS, matchRule, type ParsedRule, parseRule } from "./rule"

// 拒绝语义的固定 reason（回灌模型的 error toolResult 文案）。
const DENY_RULE_REASON = "Action denied by permission rules."
const USER_DENY_REASON = "Action denied by user."
const PLAN_MODE_MUTATION_REASON = "Action denied: Current collaboration mode is Plan Mode. Mutating actions (edit, write, apply_patch) and destructive commands are strictly prohibited in Plan Mode."
const READ_ONLY_SANDBOX_REASON = "Action denied: Current sandbox policy is read-only. File modifications and write operations are strictly prohibited."
const WORKSPACE_WRITE_SANDBOX_REASON = "Action denied: Path is outside the active workspace sandbox."

// 将规则源解析为 ParsedRule[]，非法条目跳过并记警告（与 agent.mcp 降级语义一致）。
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
  if ((toolName === "write" || toolName === "edit") && typeof record.path === "string") {
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
 * 挂 agent-loop 的 beforeToolCall 钩子：按配置规则 + 模式判定 allow/deny/ask。
 * - allow：返回 undefined 继续执行；
 * - deny：返回 { block, reason } → error toolResult 回灌模型；
 * - ask：经 attachSender 推权限请求到 renderer 命令面板，挂起等待用户决策或 run 中止。
 * 面板"允许本次会话 / 允许全部"仅为内存态，随会话切换重置，不写回配置；
 * "永久允许 / 永久拒绝"精确参数写回配置 allow[]/deny[]（allowAll 不写回）。
 * deny 规则先于 bypass / 会话级 allowAll 判定——敏感路径在绕过模式下仍受保护。
 */
class PermissionManager {
  private settings: PermissionSettings = { defaultMode: "default", allow: [], deny: [], ask: [] }
  private parsed: { allow: ParsedRule[]; deny: ParsedRule[]; ask: ParsedRule[] } = {
    allow: [],
    deny: [],
    ask: [],
  }
  // 当前激活的 MCP 工具全名（agentRunner 装配时注入；判定门控工具集用）。
  private mcpTools = new Set<string>()
  // 会话内"允许，本次不再询问"：sessionId → 已允许工具名集合。
  private sessionAllowed = new Map<string, Set<string>>()
  // 会话级"允许全部"：已授权的 sessionId（跳过规则与询问，等同会话级 bypassPermissions）。
  private sessionAllowAll = new Set<string>()
  // 挂起的权限请求：requestId → resolve + 工具上下文（永久写回需要精确参数）。
  private pending = new Map<
    string,
    { resolve: (decision: PermissionDecision) => void; toolName: string; args: unknown }
  >()
  // 权限请求推送目标（agentHandlers 注入）。
  private sendRequest: ((request: PermissionRequest) => void) | null = null
  private requestSequence = 0

  /**
   * 读取最新权限配置（非法条目降级，解析已在 settingsService 完成）。每次会话装配时调用。
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

  // 注入 MCP 工具全名集合（用于门控集判定）。
  setMcpTools(names: string[]): void {
    this.mcpTools = new Set(names)
  }

  // 注入权限请求推送目标（renderer 命令面板）。
  attachSender(sender: (request: PermissionRequest) => void): void {
    this.sendRequest = sender
  }

  /**
   * 同步判定一次工具调用的处理方式（不产生确认请求）。
   * 门控集 = bash/write/edit + 已注册 MCP 工具；豁免集与未知工具默认放行。
   * deny 规则先于一切（含 bypassPermissions）——敏感路径在绕过模式下仍受保护。
   */
  evaluate(
    toolName: string,
    args: unknown,
    contextOptions?: { collaborationMode?: "default" | "plan" },
  ): "allow" | "deny" | "ask" {
    const mode = this.settings.defaultMode
    const sandboxPolicy = this.settings.sandboxPolicy ?? "workspace-write"
    const collaborationMode = contextOptions?.collaborationMode ?? this.settings.collaborationMode ?? "default"

    // 0. 协作模式 (Plan Mode)：严禁任何写文件/编辑/修改操作及 bash 副作用
    if (collaborationMode === "plan") {
      if (toolName === "write" || toolName === "edit" || toolName === "apply_patch") {
        return "deny"
      }
    }

    // 1. 只读沙箱策略 (read-only)：严禁任何写文件/编辑/修改操作
    if (sandboxPolicy === "read-only") {
      if (toolName === "write" || toolName === "edit" || toolName === "apply_patch") {
        return "deny"
      }
    }

    // 2. 指令安全沙箱（CommandSafetyGuard）检测：破坏性高危指令绝对阻断
    if (toolName === "bash" && isRecord(args) && typeof args.command === "string") {
      const safety = evaluateCommandSafety(args.command)
      if (safety.level === "dangerous") {
        return "deny"
      }
    }

    // 3. deny 优先于 bypass：`.env` 等敏感路径在 bypass 模式下仍拦截。
    if (matchRule(this.parsed.deny, toolName, args)) return "deny"
    if (mode === "bypassPermissions" || sandboxPolicy === "danger-full-access") return "allow"
    if (EXEMPT_TOOLS.has(toolName)) return "allow"
    if (!GATED_BUILTIN_TOOLS.has(toolName) && !this.mcpTools.has(toolName)) return "allow"

    // 敏感指令即使有 allow 规则也提升为确认 (ask)
    if (toolName === "bash" && isRecord(args) && typeof args.command === "string") {
      const safety = evaluateCommandSafety(args.command)
      if (safety.level === "sensitive") {
        return "ask"
      }
    }

    const kind = matchRule(this.parsed.ask, toolName, args)
      ? "ask"
      : matchRule(this.parsed.allow, toolName, args)
        ? "allow"
        : null
    if (kind) return kind

    if (mode === "acceptEdits" && (toolName === "write" || toolName === "edit")) return "allow"
    return "ask"
  }

  /**
   * beforeToolCall 门控：同步放行/拒绝，或挂起等待用户确认。不得 throw。
   */
  async gate(
    context: BeforeToolCallContext,
    sessionId: string | null,
    signal?: AbortSignal,
    options?: { collaborationMode?: "default" | "plan" },
  ): Promise<BeforeToolCallResult | undefined> {
    const toolName = context.toolCall.name
    const args = context.args
    const collaborationMode = options?.collaborationMode ?? this.settings.collaborationMode ?? "default"

    // Plan Mode 门控硬拦截
    if (collaborationMode === "plan" && (toolName === "write" || toolName === "edit" || toolName === "apply_patch")) {
      return { block: true, reason: PLAN_MODE_MUTATION_REASON }
    }
    // 会话级"允许全部"：先查 deny（G6——绕过模式下敏感路径仍拦截），否则完全跳过规则与询问。
    if (sessionId && this.sessionAllowAll.has(sessionId)) {
      if (matchRule(this.parsed.deny, toolName, args))
        return { block: true, reason: DENY_RULE_REASON }
      return undefined
    }
    const decision = this.evaluate(toolName, args)
    if (decision === "allow") return undefined
    if (decision === "deny") {
      const sandboxPolicy = this.settings.sandboxPolicy ?? "workspace-write"
      if (
        collaborationMode === "plan" &&
        (toolName === "write" || toolName === "edit" || toolName === "apply_patch")
      ) {
        return { block: true, reason: PLAN_MODE_MUTATION_REASON }
      }
      if (
        sandboxPolicy === "read-only" &&
        (toolName === "write" || toolName === "edit" || toolName === "apply_patch")
      ) {
        return { block: true, reason: READ_ONLY_SANDBOX_REASON }
      }
      if (toolName === "bash" && isRecord(args) && typeof args.command === "string") {
        const safety = evaluateCommandSafety(args.command)
        if (safety.level === "dangerous" && safety.reason) {
          return { block: true, reason: safety.reason }
        }
      }
      return { block: true, reason: DENY_RULE_REASON }
    }
    // ask：会话内已允许的同名调用直接放行。
    if (sessionId && this.sessionAllowed.get(sessionId)?.has(toolName)) return undefined

    // 无推送目标（未接线）时按拒绝处理（fail-safe）。
    if (!this.sendRequest) return { block: true, reason: USER_DENY_REASON }

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
      // 保存工具上下文：永久写回需要精确参数。
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
    }
    return undefined
  }

  /**
   * 处理 renderer 的权限决策；未知/过期 requestId 返回 false。
   * permanent=true 时按决策写回配置 allow[]/deny[]（精确参数）并重载规则。
   */
  respond(response: PermissionResponse): boolean {
    const pending = this.pending.get(response.requestId)
    if (!pending) return false
    this.pending.delete(response.requestId)
    const { resolve, toolName, args } = pending
    // G5：永久允许/拒绝写回配置（精确参数；allowAll 不写回）。
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

  // 永久决策写回配置：追加精确参数规则（去重）后保存 + 重载，同工具同参数后续直接命中。
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

  // 记录会话内已允许的工具名（仅内存态）。
  rememberForSession(sessionId: string, toolName: string): void {
    let allowed = this.sessionAllowed.get(sessionId)
    if (!allowed) {
      allowed = new Set()
      this.sessionAllowed.set(sessionId, allowed)
    }
    allowed.add(toolName)
  }

  // 会话切换/结束时清理：会话内记忆 + allow-all + 该会话挂起的请求（按拒绝处理）。
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

// 永久写回的规则串：精确参数原样（不做 Tool() 无参放大）——换参数/换文件回到正常确认流。
// bash → `Bash(command)`；write/edit → `Write(path)`/`Edit(path)`；webfetch → `WebFetch(url)`；
// 其余（task/MCP）→ `Tool(args JSON)`。
const formatRule = (toolName: string, args: unknown): string => {
  const record = isRecord(args) ? args : {}
  const capitalized = toolName.charAt(0).toUpperCase() + toolName.slice(1)
  if (toolName === "bash" && typeof record.command === "string") {
    return `Bash(${record.command})`
  }
  if ((toolName === "write" || toolName === "edit") && typeof record.path === "string") {
    return `${capitalized}(${record.path})`
  }
  if (toolName === "webfetch" && typeof record.url === "string") {
    return `WebFetch(${record.url})`
  }
  return `${capitalized}(${JSON.stringify(args ?? {})})`
}

// PermissionManager 单例。
export const permissionManager = new PermissionManager()
