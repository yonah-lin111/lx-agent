import { describe, expect, it } from "vitest"
import { ALL_TOOL_NAMES, createRegistry } from "@/agent/assembly"
import { EXEMPT_TOOLS } from "@/agent/permissions/rule"
import { createWireframeTool } from "@/agent/tools/wireframe"
import { DEFAULT_TOOLS } from "@/services/capabilityService"

describe("wireframe tool", () => {
  it("validates inputSchema correctly", () => {
    const tool = createWireframeTool()

    // Missing title
    expect(tool.inputSchema.safeParse({ layout: "┌─┐\n└─┘" }).success).toBe(false)

    // Missing layout
    expect(tool.inputSchema.safeParse({ title: "My Page" }).success).toBe(false)

    // Valid minimal input
    const minParsed = tool.inputSchema.safeParse({
      title: "My Page",
      layout: "┌─┐\n└─┘",
    })
    expect(minParsed.success).toBe(true)

    // Valid input with description
    const fullParsed = tool.inputSchema.safeParse({
      title: "My Page",
      layout: "┌─┐\n└─┘",
      description: "Simple card layout",
    })
    expect(fullParsed.success).toBe(true)
  })

  it("executes and formats wireframe layout into text content and details", async () => {
    const tool = createWireframeTool()
    const layout = [
      "┌──────────────────────────────┐",
      "│  Header                      │",
      "├──────────────────────────────┤",
      "│  Content                     │",
      "└──────────────────────────────┘",
    ].join("\n")

    const result = await tool.execute("call_123", {
      title: "Dashboard Overview",
      layout,
      description: "Header on top, content below",
    })

    expect(result.content[0].type).toBe("text")
    const text = (result.content[0] as { type: "text"; text: string }).text
    expect(text).toContain("# Wireframe: Dashboard Overview")
    expect(text).toContain("Description: Header on top, content below")
    expect(text).toContain("```\n" + layout + "\n```")

    expect(result.details).toEqual({
      title: "Dashboard Overview",
      layout,
      description: "Header on top, content below",
    })
  })

  it("handles execution without description", async () => {
    const tool = createWireframeTool()
    const layout = "┌─┐\n└─┘"
    const result = await tool.execute("call_456", {
      title: "Small Box",
      layout,
    })

    const text = (result.content[0] as { type: "text"; text: string }).text
    expect(text).toContain("# Wireframe: Small Box")
    expect(text).not.toContain("Description:")
    expect(text).toContain("```\n" + layout + "\n```")
    expect(result.details).toEqual({
      title: "Small Box",
      layout,
      description: undefined,
    })
  })

  it("is registered in ALL_TOOL_NAMES, createRegistry, and DEFAULT_TOOLS", () => {
    expect(ALL_TOOL_NAMES.has("wireframe")).toBe(true)
    expect(DEFAULT_TOOLS.includes("wireframe")).toBe(true)
    expect(EXEMPT_TOOLS.has("wireframe")).toBe(true)

    const registry = createRegistry("/fake/cwd", ["wireframe"], [], false)
    const active = registry.getActive()
    expect(active.some((t) => t.name === "wireframe")).toBe(true)
  })
})
