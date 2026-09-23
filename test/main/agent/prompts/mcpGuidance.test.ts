import { describe, expect, it } from "vitest"
import {
  formatMcpGuidancePrompt,
  MCP_GUIDANCE_PRIORITY,
  MCP_GUIDANCE_WORKSPACE_HYGIENE,
} from "@/agent/prompts/mcpGuidance"

describe("MCP Guidance Prompt (代码检索 MCP 策略指引)", () => {
  it("空列表 / 未知 server 不产生任何注入", () => {
    expect(formatMcpGuidancePrompt([])).toBe("")
    expect(formatMcpGuidancePrompt(["context7", "unknown-server"])).toBe("")
  })

  it("codegraph 单独注入：包含 role / when_to_use / initialization 与初始化命令", () => {
    const text = formatMcpGuidancePrompt(["codegraph"])

    expect(text).toContain("<mcp_guidance>")
    expect(text).toContain("</mcp_guidance>")
    expect(text).toContain(`<priority>${MCP_GUIDANCE_PRIORITY}</priority>`)
    expect(text).toContain("PRIMARY strategy")
    expect(text).toContain('<server name="codegraph">')
    expect(text).toContain("<role>")
    expect(text).toContain("codegraph_explore")
    expect(text).toContain("<when_to_use>")
    expect(text).toContain("<initialization>")
    expect(text).toContain("`codegraph init`")
    expect(text).toContain(".codegraph/ index")
    expect(text).not.toContain('<server name="codebase-memory-mcp">')
  })

  it("codebase-memory-mcp 单独注入：包含图谱定位与索引初始化指令", () => {
    const text = formatMcpGuidancePrompt(["codebase-memory-mcp"])

    expect(text).toContain('<server name="codebase-memory-mcp">')
    expect(text).toContain("Persistent repository-level knowledge graph")
    expect(text).toContain("trace_path")
    expect(text).toContain("index_repository")
    expect(text).toContain("list_projects")
    expect(text).not.toContain('<server name="codegraph">')
  })

  it("两者同时注入：各自独立成块且共享 priority 与 workspace_hygiene", () => {
    const text = formatMcpGuidancePrompt(["codegraph", "codebase-memory-mcp"])

    const priorityCount = text.match(/<priority>/g)?.length ?? 0
    expect(priorityCount).toBe(1)
    expect(text).toContain(
      `<workspace_hygiene>${MCP_GUIDANCE_WORKSPACE_HYGIENE}</workspace_hygiene>`,
    )
    expect(text).toContain(".gitignore")
    expect(text).toContain(".codegraph/")
    expect(text).toContain(".codebase-memory/")
    expect(text).toContain('<server name="codegraph">')
    expect(text).toContain('<server name="codebase-memory-mcp">')
    expect(text.indexOf('<server name="codegraph">')).toBeLessThan(
      text.indexOf('<server name="codebase-memory-mcp">'),
    )
  })

  it("名称大小写不敏感，重复项只注入一次", () => {
    const text = formatMcpGuidancePrompt(["CodeGraph", "codegraph"])

    expect(text.match(/<server name="codegraph">/g)?.length).toBe(1)
  })
})
