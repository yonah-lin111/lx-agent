import { describe, expect, it, vi } from "vitest"
import { ALL_TOOL_NAMES, createRegistry } from "@/agent/assembly"
import { EXEMPT_TOOLS, GATED_BUILTIN_TOOLS } from "@/agent/permissions/rule"
import { createDefaultSystemPromptManager } from "@/agent/prompts/systemPromptManager"
import { createQuestionTool } from "@/agent/tools/question"
import { DEFAULT_TOOLS, getDefaultCapabilities } from "@/services/capabilityService"

describe("Render Tools Removal & Question Contract System Regression (Main)", () => {
  const BANNED_TOOLS = ["render_svg", "render_ascii", "render_html"]

  it("ALL_TOOL_NAMES 彻底剔除 3 个内联 render 工具", () => {
    for (const tool of BANNED_TOOLS) {
      expect(ALL_TOOL_NAMES.has(tool)).toBe(false)
    }
  })

  it("DEFAULT_TOOLS 与 getDefaultCapabilities() 彻底剔除 3 个内联 render 工具", () => {
    for (const tool of BANNED_TOOLS) {
      expect(DEFAULT_TOOLS.includes(tool)).toBe(false)
    }
    const caps = getDefaultCapabilities()
    for (const tool of BANNED_TOOLS) {
      expect(caps.tools.includes(tool)).toBe(false)
    }
  })

  it("权限规则集 (EXEMPT_TOOLS / GATED_BUILTIN_TOOLS) 中不包含 3 个 render 工具", () => {
    for (const tool of BANNED_TOOLS) {
      expect(EXEMPT_TOOLS.has(tool)).toBe(false)
      expect(GATED_BUILTIN_TOOLS.has(tool)).toBe(false)
    }
  })

  it("createRegistry 创建的工具注册表中不包含 3 个 render 工具", () => {
    const registry = createRegistry(process.cwd(), ["read", "ls"], [], false)
    const registeredNames = registry.getAll().map((tool) => tool.name)
    for (const tool of BANNED_TOOLS) {
      expect(registeredNames.includes(tool)).toBe(false)
    }
  })

  it("SystemPromptManager 在 design 协作模式下不注入已废弃的 render 工具说明", async () => {
    const manager = createDefaultSystemPromptManager()
    const assembly = await manager.assemble({ collaborationMode: "design" })
    for (const tool of BANNED_TOOLS) {
      expect(assembly.rendered).not.toContain(tool)
    }
    expect(assembly.rendered).toContain("<front_design")
  })

  describe("question 工具契约严格校验", () => {
    it("question tool description 不包含 3 种图形化模式提示词", () => {
      const askQuestionMock = vi.fn().mockResolvedValue([{ question: "q1", answer: ["A"] }])
      const tool = createQuestionTool({ askQuestion: askQuestionMock })
      expect(tool.description).not.toContain("SVG Diagrams")
      expect(tool.description).not.toContain("ASCII Art")
      expect(tool.description).not.toContain("HTML Prototypes")
      expect(tool.description).not.toContain("content")
    })

    it("question tool schema 验证合法纯文本提问成功并正常执行", async () => {
      const askQuestionMock = vi
        .fn()
        .mockResolvedValue([{ question: "选方案？", answer: ["方案A"] }])
      const tool = createQuestionTool({ askQuestion: askQuestionMock })

      const parseResult = tool.inputSchema.safeParse({
        questions: [
          {
            question: "选方案？",
            header: "架构确认",
            options: [{ label: "方案A" }, { label: "方案B" }],
          },
        ],
      })
      expect(parseResult.success).toBe(true)

      const execResult = await tool.execute("call-1", parseResult.data!)
      expect(askQuestionMock).toHaveBeenCalledWith(
        [
          {
            question: "选方案？",
            header: "架构确认",
            options: [{ label: "方案A" }, { label: "方案B" }],
          },
        ],
        "call-1",
        undefined,
      )
      const firstBlock = execResult.content[0]
      if (firstBlock.type !== "text") throw new Error("expected a text block")
      expect(firstBlock.text).toContain('"选方案？"="方案A"')
    })
  })
})
