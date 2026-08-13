import { globToRegExp } from "@/agent/tools/search"

// 门控内置工具（有副作用或可外发数据；task 委托子代理运行，须确认后才 spawn；webfetch 拉取外网原文）。
export const GATED_BUILTIN_TOOLS = new Set(["bash", "write", "edit", "task", "webfetch"])

// 豁免工具集：永不询问（纯公开检索 + 本地只读 + 纯交互无副作用）。
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

// bash 参数匹配：命令前缀（CC 语义），含 `*` 时按命令 glob 全匹配。
const matchBashArg = (ruleArg: string, command: string): boolean => {
  if (ruleArg.includes("*")) return commandGlobToRegExp(ruleArg).test(command)
  return command.startsWith(ruleArg)
}

// 路径 glob 匹配（相对会话 cwd）。
const matchPathArg = (ruleArg: string, path: string): boolean => globToRegExp(ruleArg).test(path)

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
    return matchBashArg(rule.arg, url)
  }
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
