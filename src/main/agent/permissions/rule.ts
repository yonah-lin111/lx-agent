import { resolve } from "node:path"
import { parsePatch } from "@/agent/tools/applyPatchParser"
import { globToRegExp } from "@/agent/tools/search"

// 门控内置工具（有副作用或可外发数据；task 委托子代理运行，须确认后才 spawn；webfetch 拉取外网原文；apply_patch/write/edit 修改文件）。
export const GATED_BUILTIN_TOOLS = new Set([
  "bash",
  "write",
  "edit",
  "apply_patch",
  "task",
  "webfetch",
])

// 豁免工具集：永不询问（纯公开检索 + 本地只读 + 纯交互无副作用）。
// 读操作不设路径边界是产品决策（AGENTS.md 级别说明见 docs/agent/permissions.md），memory 显式登记避免落入"未知工具默认放行"的隐式路径。
export const EXEMPT_TOOLS = new Set([
  "web_search",
  "read",
  "ls",
  "grep",
  "find",
  "time",
  "read_skill",
  "question",
  "lsp",
  "view_image",
  "memory",
  "wireframe",
  // 模式编排工具：纯会话状态切换（退出只读模式仍需用户批准），无文件/命令副作用。
  "switch_mode",
])

// 规则类别。
export type RuleKind = "allow" | "deny" | "ask"

// 解析后的规则。
export interface ParsedRule {
  toolName: string
  // 参数原文（空串 = 全部调用命中）。
  arg: string
  source: string
}

// 判断值是否为普通对象。
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * 解析 `ToolName(arg)` 规则；支持 `ToolName` / `ToolName()` 空参（命中全部调用）。
 * 非法条目返回 null（由调用方跳过并记警告）。
 */
export const parseRule = (source: string): ParsedRule | null => {
  const match = /^([A-Za-z0-9_-]+)(?:\((.*)\))?$/.exec(source.trim())
  if (!match) return null
  return { toolName: match[1], arg: match[2] ?? "", source }
}

// bash 命令 glob：`*` 跨斜杠（命令不是文件路径，路径 glob 的 [^/] 语义不适用）。
const commandGlobToRegExp = (pattern: string): RegExp => {
  let source = "^"
  for (const char of pattern) {
    if (char === "*") {
      source += ".*"
    } else if (char === "?") {
      source += "."
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    }
  }
  return new RegExp(`${source}$`)
}

// bash 命令词边界：前缀之后必须是空白或 shell 分隔符，避免 `pnpm test` 放行 `pnpm testing`。
const COMMAND_BOUNDARY = /[\s;&|()<>]/

// 单字符是否处于命令词边界（结束视为边界）。
const isCommandBoundary = (char: string | undefined): boolean =>
  char === undefined || COMMAND_BOUNDARY.test(char)

// bash 参数匹配：命令前缀（CC 语义，前缀后须为命令词边界），含 `*` 时按命令 glob 全匹配。
const matchBashArg = (ruleArg: string, command: string): boolean => {
  if (ruleArg.includes("*")) return commandGlobToRegExp(ruleArg).test(command)
  if (!command.startsWith(ruleArg)) return false
  // 规则本身以空白/分隔符结尾时已处于词边界，直接命中。
  return (
    isCommandBoundary(ruleArg[ruleArg.length - 1]) || isCommandBoundary(command[ruleArg.length])
  )
}

// 去除路径末尾斜杠（根路径保留），用于 URL 路径段边界比较。
const stripTrailingSlash = (path: string): string =>
  path.length > 1 ? path.replace(/\/+$/, "") : path

// webfetch URL 匹配：scheme/host/port 一致，路径按段边界前缀匹配；无法解析为 URL 时不命中。
const matchWebfetchArg = (ruleArg: string, url: string): boolean => {
  let ruleUrl: URL
  let targetUrl: URL
  try {
    ruleUrl = new URL(ruleArg)
    targetUrl = new URL(url)
  } catch {
    // 非 URL 规则或非法目标 URL：保守不命中（allow 规则不会误放行）。
    return false
  }
  if (ruleUrl.protocol !== targetUrl.protocol) return false
  if (ruleUrl.hostname !== targetUrl.hostname) return false
  if (ruleUrl.port !== targetUrl.port) return false
  const rulePath = stripTrailingSlash(ruleUrl.pathname)
  if (rulePath === "/") return true
  const targetPath = stripTrailingSlash(targetUrl.pathname)
  return targetPath === rulePath || targetPath.startsWith(`${rulePath}/`)
}

// 路径 glob 匹配（相对会话 cwd）。工具落盘用 path.resolve 规范化路径，
// deny/allow 规则必须对规范化后的等价形式同样生效（`//etc/hosts`、`a/../etc` 不绕过拦截）。
const matchPathArg = (ruleArg: string, path: string): boolean => {
  if (!path) return false
  const matcher = globToRegExp(ruleArg)
  return matcher.test(path) || matcher.test(resolve(path))
}

// apply_patch 参数匹配：解析补丁目标路径，ruleArg 作为路径命中任一目标即算命中；解析失败不命中。
const matchApplyPatchArg = (ruleArg: string, args: unknown): boolean => {
  const patch = isRecord(args) && typeof args.patch === "string" ? args.patch : ""
  if (!patch) return false
  try {
    return parsePatch(patch).actions.some((action) => matchPathArg(ruleArg, action.path))
  } catch {
    // 补丁无法解析：不命中（解析错误本身由工具报错）。
    return false
  }
}

/**
 * 单条规则对一次调用的命中判定。
 */
const matchArgs = (rule: ParsedRule, toolName: string, args: unknown): boolean => {
  if (rule.arg === "") return true
  if (toolName === "bash") {
    const command = isRecord(args) && typeof args.command === "string" ? args.command : ""
    return matchBashArg(rule.arg, command)
  }
  if (toolName === "write" || toolName === "edit") {
    const path = isRecord(args) && typeof args.path === "string" ? args.path : ""
    return matchPathArg(rule.arg, path)
  }
  if (toolName === "webfetch") {
    const url = isRecord(args) && typeof args.url === "string" ? args.url : ""
    return matchWebfetchArg(rule.arg, url)
  }
  if (toolName === "apply_patch") return matchApplyPatchArg(rule.arg, args)
  // MCP 工具：参数 JSON 子串匹配（宽松）。
  return JSON.stringify(args ?? {}).includes(rule.arg)
}

/**
 * 在规则列表中寻找最具体命中（同类规则取参数最长者）；无命中返回 null。
 * 跨类别优先级由调用方（permissionManager）按 deny > ask > allow 逐类判定。
 * 工具名大小写不敏感（规则按 CC 惯例写 Bash/Write/Edit，实际调用名为小写）。
 */
export const matchRule = (rules: ParsedRule[], toolName: string, args: unknown): boolean => {
  let best: ParsedRule | null = null
  for (const rule of rules) {
    if (rule.toolName.toLowerCase() !== toolName.toLowerCase()) continue
    if (!matchArgs(rule, toolName, args)) continue
    if (!best || rule.arg.length > best.arg.length) best = rule
  }
  return best !== null
}
