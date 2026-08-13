import { describe, expect, it } from "vitest"
import { EXEMPT_TOOLS, matchRule, type ParsedRule, parseRule } from "@/agent/permissions/rule"

// 解析规则列表（测试内保证全部合法，非法即抛错）。
const parsed = (sources: string[]): ParsedRule[] =>
  sources.map((source) => {
    const rule = parseRule(source)
    if (!rule) throw new Error(`非法规则: ${source}`)
    return rule
  })

describe("EXEMPT_TOOLS", () => {
  it("lsp 归入豁免集（只读检索永不询问）", () => {
    expect(EXEMPT_TOOLS.has("lsp")).toBe(true)
  })
})

describe("parseRule", () => {
  it("解析 ToolName(arg)", () => {
    expect(parseRule("Bash(git status)")).toEqual({
      toolName: "Bash",
      arg: "git status",
      source: "Bash(git status)",
    })
  })

  it("空参 ToolName() 与裸 ToolName 均视为命中全部调用", () => {
    expect(parseRule("Bash()")?.arg).toBe("")
    expect(parseRule("Bash")?.arg).toBe("")
    expect(parseRule("codegraph_codegraph_search()")?.toolName).toBe("codegraph_codegraph_search")
  })

  it("支持 MCP 全名（下划线拼接）", () => {
    expect(parseRule("codegraph_codegraph_search(foo)")?.toolName).toBe(
      "codegraph_codegraph_search",
    )
  })

  it("非法格式返回 null", () => {
    expect(parseRule("not a rule")).toBeNull()
    expect(parseRule("Bash(git status")).toBeNull()
    expect(parseRule("")).toBeNull()
    expect(parseRule("Bash(arg) extra")).toBeNull()
  })
})

describe("matchRule", () => {
  it("bash 命令前缀匹配（CC 语义，规则大写与实际小写调用名不敏感匹配）", () => {
    const rules = parsed(["Bash(git status)"])
    expect(matchRule(rules, "bash", { command: "git status --short" })).toBe(true)
    expect(matchRule(rules, "bash", { command: "git log" })).toBe(false)
    expect(matchRule(rules, "bash", {})).toBe(false)
  })

  it("bash 含 * 时按 glob 全匹配", () => {
    const rules = parsed(["Bash(npm *)"])
    expect(matchRule(rules, "bash", { command: "npm install" })).toBe(true)
    expect(matchRule(rules, "bash", { command: "npmx install" })).toBe(false)
  })

  it("bash 命令 glob 跨斜杠（rm -rf * 命中带路径命令）", () => {
    const rules = parsed(["Bash(rm -rf *)"])
    expect(matchRule(rules, "bash", { command: "rm -rf /tmp/x" })).toBe(true)
    expect(matchRule(rules, "bash", { command: "rm -rf" })).toBe(false)
  })

  it("write/edit 路径 glob 匹配", () => {
    const rules = parsed(["Write(src/**)"])
    expect(matchRule(rules, "write", { path: "src/a.ts" })).toBe(true)
    expect(matchRule(rules, "write", { path: "src/nested/a.ts" })).toBe(true)
    expect(matchRule(rules, "write", { path: "lib/a.ts" })).toBe(false)
  })

  it("webfetch URL 前缀匹配（同 bash 前缀语义）", () => {
    const rules = parsed(["WebFetch(https://api.example.com)"])
    expect(matchRule(rules, "webfetch", { url: "https://api.example.com/v1/x" })).toBe(true)
    expect(matchRule(rules, "webfetch", { url: "https://api.example.com" })).toBe(true)
    expect(matchRule(rules, "webfetch", { url: "https://other.com" })).toBe(false)
    expect(matchRule(rules, "webfetch", {})).toBe(false)
  })

  it("空参命中全部调用", () => {
    const rules = parsed(["Bash()"])
    expect(matchRule(rules, "bash", { command: "anything" })).toBe(true)
    expect(matchRule(rules, "bash", {})).toBe(true)
  })

  it("MCP 工具参数 JSON 子串匹配", () => {
    const rules = parsed(["codegraph_codegraph_search(foo)"])
    expect(matchRule(rules, "codegraph_codegraph_search", { query: "foo bar" })).toBe(true)
    expect(matchRule(rules, "codegraph_codegraph_search", { query: "baz" })).toBe(false)
  })

  it("同类规则取参数最长（最具体）者", () => {
    const rules = parsed(["Bash(git)", "Bash(git status)"])
    expect(matchRule(rules, "bash", { command: "git status --short" })).toBe(true)
    // git 前缀亦命中（两条规则都命中时返回 true；具体性用于优先级内部判定）。
    expect(matchRule(rules, "bash", { command: "git" })).toBe(true)
  })

  it("仅匹配工具名相同的规则", () => {
    const rules = parsed(["Bash(git status)"])
    expect(matchRule(rules, "write", { command: "git status" })).toBe(false)
  })
})
