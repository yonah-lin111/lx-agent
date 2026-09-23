import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  createDefaultSystemPromptManager,
  interpolateVariables,
  MINIMAL_MODE_PROMPT,
  PROMPT_ORDERS,
  PROMPT_SECTION_NAMES,
  SystemPromptManager,
} from "@/agent/prompts/systemPromptManager"

describe("SystemPromptManager", () => {
  describe("interpolateVariables", () => {
    it("正确替换已注册的变量", () => {
      const text = "Hello {{user_name}}, welcome to {{project_dir}}!"
      const vars = { user_name: "Alice", project_dir: "/workspace" }
      const res = interpolateVariables(text, vars, "section", "test")
      expect(res).toBe("Hello Alice, welcome to /workspace!")
    })

    it("保留不包含闭合 }} 的独立 {{ 字符", () => {
      const text = "Literal {{ without closing"
      const res = interpolateVariables(text, {}, "section", "test")
      expect(res).toBe("Literal {{ without closing")
    })

    it("遇到未注册变量时抛出异常", () => {
      const text = "Hello {{unknown_var}}!"
      expect(() => interpolateVariables(text, {}, "section", "test")).toThrow(
        /unknown prompt variable/,
      )
    })

    it("遇到未定义值的变量时抛出异常", () => {
      const text = "Hello {{missing_val}}!"
      expect(() =>
        interpolateVariables(text, { missing_val: undefined }, "section", "test"),
      ).toThrow(/has no value/)
    })

    it("遇到格式非法的变量名时抛出异常", () => {
      const text = "Hello {{123bad}}!"
      expect(() => interpolateVariables(text, {}, "section", "test")).toThrow(/malformed prompt/)
    })
  })

  describe("分层装配与顺序 (Order & Assembly)", () => {
    it("按照 order 升序排列各分段", async () => {
      const manager = new SystemPromptManager()
      manager.registerSection({
        name: "b",
        order: 10,
        text: "Section B",
      })
      manager.registerSection({
        name: "a",
        order: -10,
        text: "Section A",
      })
      manager.registerSection({
        name: "c",
        order: 0,
        text: "Section C",
      })

      const assembly = await manager.assemble()
      expect(assembly.sections.map((s) => s.name)).toEqual(["a", "c", "b"])
      expect(assembly.rendered).toBe("Section A\n\nSection C\n\nSection B")
    })

    it("空分段自动过滤", async () => {
      const manager = new SystemPromptManager()
      manager.registerSection({
        name: "a",
        order: 1,
        text: "Section A",
      })
      manager.registerSection({
        name: "empty",
        order: 2,
        text: () => "   ",
      })
      manager.registerSection({
        name: "b",
        order: 3,
        text: "Section B",
      })

      const assembly = await manager.assemble()
      expect(assembly.sections.map((s) => s.name)).toEqual(["a", "b"])
      expect(assembly.rendered).toBe("Section A\n\nSection B")
    })
  })

  describe("作用域覆盖与注销 (Scope & Disposal)", () => {
    it("会话作用域分段覆盖同名全局分段", async () => {
      const manager = new SystemPromptManager()
      manager.registerSection({
        name: "persona",
        order: 0,
        text: "Global Persona",
      })

      const unregister = manager.registerSection(
        {
          name: "persona",
          order: 0,
          text: "Session Custom Persona",
        },
        "session-1",
      )

      // 全局上下文
      const globalRendered = await manager.render({})
      expect(globalRendered).toBe("Global Persona")

      // session-1 上下文
      const sessionRendered = await manager.render({ sessionId: "session-1" })
      expect(sessionRendered).toBe("Session Custom Persona")

      // 注销 session-1 覆盖
      unregister()
      const afterUnregister = await manager.render({ sessionId: "session-1" })
      expect(afterUnregister).toBe("Global Persona")
    })

    it("支持 clearScope 清除整个会话的所有注册", async () => {
      const manager = new SystemPromptManager()
      manager.registerSection(
        {
          name: "temp",
          order: 10,
          text: "Temp Section",
        },
        "session-xyz",
      )

      expect(await manager.render({ sessionId: "session-xyz" })).toBe("Temp Section")
      manager.clearScope("session-xyz")
      expect(await manager.render({ sessionId: "session-xyz" })).toBe("")
    })
  })

  describe("独占提示词 (Complete Section)", () => {
    it("激活 complete 段时独占整个系统提示词", async () => {
      const manager = new SystemPromptManager()
      manager.registerSection({
        name: "identity",
        order: -100,
        text: "System Identity",
      })
      manager.registerSection({
        name: "persona",
        order: 0,
        text: "System Persona",
      })
      manager.registerSection({
        name: "override-all",
        order: 50,
        text: "Sole Complete Prompt",
        complete: true,
      })

      const assembly = await manager.assemble()
      expect(assembly.sections.length).toBe(1)
      expect(assembly.sections[0]!.name).toBe("override-all")
      expect(assembly.rendered).toBe("Sole Complete Prompt")
    })

    it("同时存在多个 complete 段时抛出异常", async () => {
      const manager = new SystemPromptManager()
      manager.registerSection({
        name: "complete1",
        order: 1,
        text: "C1",
        complete: true,
      })
      manager.registerSection({
        name: "complete2",
        order: 2,
        text: "C2",
        complete: true,
      })

      await expect(manager.assemble()).rejects.toThrow(/multiple complete prompt sections/)
    })
  })

  describe("拦截器 (Interceptors)", () => {
    it("拦截器能够动态修改或扩展 PromptAssembly", async () => {
      const manager = new SystemPromptManager()
      manager.registerSection({
        name: "base",
        order: 0,
        text: "Base content",
      })

      manager.registerInterceptor({
        name: "append-warning",
        apply: (assembly) => {
          return {
            ...assembly,
            rendered: `${assembly.rendered}\n\n[WARNING: Intercepted]`,
          }
        },
      })

      const res = await manager.render()
      expect(res).toBe("Base content\n\n[WARNING: Intercepted]")
    })
  })

  describe("默认单例与内置分层 (createDefaultSystemPromptManager)", () => {
    it("包含基础身份、行为层、Persona 及动态技能与指令分层", async () => {
      const manager = createDefaultSystemPromptManager()
      const assembly = await manager.assemble({
        activeSkills: [
          {
            name: "test-skill",
            description: "A test skill description",
            filePath: "/path/to/SKILL.md",
            baseDir: "/path/to",
            disableModelInvocation: false,
          },
        ],
        variables: {
          cwd: "/workspace",
          repo_root: "/workspace",
          git_branch: "main",
          platform: "darwin",
          date: "Mon Aug 24 2026",
        },
      })

      expect(assembly.sections.some((s) => s.name === PROMPT_SECTION_NAMES.IDENTITY)).toBe(true)
      expect(assembly.sections.some((s) => s.name === PROMPT_SECTION_NAMES.BEHAVIOR)).toBe(true)
      expect(assembly.sections.some((s) => s.name === PROMPT_SECTION_NAMES.PERSONA)).toBe(true)
      expect(assembly.sections.some((s) => s.name === PROMPT_SECTION_NAMES.SKILLS)).toBe(true)
      expect(assembly.contexts.some((c) => c.name === PROMPT_SECTION_NAMES.ENVIRONMENT)).toBe(true)

      expect(assembly.rendered).toContain("You are Yonah (also known as LX)")
      expect(assembly.rendered).toContain("<behavior>")
      expect(assembly.rendered).toContain("<preamble>")
      expect(assembly.rendered).toContain("<task_planning>")
      expect(assembly.rendered).toContain("<ambition_vs_precision>")
      expect(assembly.rendered).toContain("<file_mutations>")
      expect(assembly.rendered).toContain("<multi_agent>")
      expect(assembly.rendered).toContain("<verification>")
      expect(assembly.rendered).toContain("<safety>")
      expect(assembly.rendered).toContain("<response_format>")
      expect(assembly.rendered).toContain("<code_review>")
      expect(assembly.rendered).toContain("<frontend_design>")
      expect(assembly.rendered).not.toContain("## Preamble & Intent Declaration")
      expect(assembly.rendered).toContain("<available_skills>")
      expect(assembly.rendered).toContain("test-skill")

      // 默认 pragmatic 人格验证（XML 化的 persona / operating_principles）
      expect(assembly.rendered).toContain('<persona name="pragmatic">')
      expect(assembly.rendered).toContain(
        "You are a pragmatic, direct, and high-signal engineering collaborator.",
      )
      expect(assembly.rendered).toContain("<operating_principles>")
      expect(assembly.rendered).toContain("Read a file to confirm its content before modifying it")

      const envCtx = assembly.contexts.find((c) => c.name === PROMPT_SECTION_NAMES.ENVIRONMENT)
      expect(envCtx?.text).toContain("<env>")
      expect(envCtx?.text).toContain("Working directory: /workspace")
      expect(envCtx?.text).toContain("Workspace root folder: /workspace")
      expect(envCtx?.text).toContain("Git branch: main")
      expect(envCtx?.text).toContain("Platform: darwin")
      expect(envCtx?.text).toContain("Today's date: Mon Aug 24 2026")
      expect(envCtx?.text).toContain("</env>")
    })

    it("支持动态切换 friendly 人格", async () => {
      const manager = createDefaultSystemPromptManager()
      const assembly = await manager.assemble({
        personality: "friendly",
      })

      expect(assembly.rendered).toContain('<persona name="friendly">')
      expect(assembly.rendered).toContain(
        "You are an encouraging, collaborative, and insightful engineering co-builder.",
      )
      expect(assembly.rendered).not.toContain(
        "You are a pragmatic, direct, and high-signal engineering collaborator.",
      )
    })

    describe("MCP 策略指引注入 (MCP Guidance)", () => {
      it("未提供 mcpServers 时整段不注入", async () => {
        const manager = createDefaultSystemPromptManager()
        const assembly = await manager.assemble({})

        expect(assembly.sections.some((s) => s.name === PROMPT_SECTION_NAMES.MCP_GUIDANCE)).toBe(
          false,
        )
        expect(assembly.rendered).not.toContain("<mcp_guidance>")
      })

      it("提供 mcpServers 时注入独立分段，且位于 skills 之后、instructions 之前", async () => {
        const manager = createDefaultSystemPromptManager()
        const assembly = await manager.assemble({
          mcpServers: ["codegraph", "codebase-memory-mcp"],
          activeSkills: [
            {
              name: "test-skill",
              description: "A test skill description",
              filePath: "/path/to/SKILL.md",
              baseDir: "/path/to",
              disableModelInvocation: false,
            },
          ],
        })

        const guidance = assembly.sections.find((s) => s.name === PROMPT_SECTION_NAMES.MCP_GUIDANCE)
        expect(guidance).toBeDefined()
        expect(guidance?.text).toContain("<mcp_guidance>")
        expect(guidance?.text).toContain('<server name="codegraph">')
        expect(guidance?.text).toContain('<server name="codebase-memory-mcp">')
        expect(guidance?.text).toContain("PRIMARY strategy")
        expect(assembly.rendered).toContain("<mcp_guidance>")

        // 分层顺序：SKILLS(100) < MCP_GUIDANCE(110) < INSTRUCTIONS(200)
        expect(PROMPT_ORDERS.MCP_GUIDANCE).toBeGreaterThan(PROMPT_ORDERS.SKILLS)
        expect(PROMPT_ORDERS.MCP_GUIDANCE).toBeLessThan(PROMPT_ORDERS.INSTRUCTIONS)

        const guidanceIndex = assembly.sections.findIndex(
          (s) => s.name === PROMPT_SECTION_NAMES.MCP_GUIDANCE,
        )
        const skillsIndex = assembly.sections.findIndex(
          (s) => s.name === PROMPT_SECTION_NAMES.SKILLS,
        )
        expect(skillsIndex).toBeGreaterThan(-1)
        expect(guidanceIndex).toBeGreaterThan(skillsIndex)
      })

      it("未知 server 名不产生任何注入", async () => {
        const manager = createDefaultSystemPromptManager()
        const assembly = await manager.assemble({
          mcpServers: ["context7", "unknown-server"],
        })

        expect(assembly.rendered).not.toContain("<mcp_guidance>")
      })
    })

    describe("上下文容量感知与 Guidance 注入 (Context Window Guidance)", () => {
      it("低于 75% 时不产生任何引导注入（零 Token 开销）", async () => {
        const manager = createDefaultSystemPromptManager()
        const assembly = await manager.assemble({
          contextUsage: { tokens: 70_000, contextWindow: 100_000 },
        })

        const guidance = assembly.contexts.find(
          (c) => c.name === PROMPT_SECTION_NAMES.CONTEXT_WINDOW_GUIDANCE,
        )
        expect(guidance).toBeUndefined()
        expect(assembly.rendered).not.toContain("<context_window_guidance")
      })

      it("处于 75% ~ 90% 时生成 warning 级别引导 XML 块", async () => {
        const manager = createDefaultSystemPromptManager()
        const assembly = await manager.assemble({
          contextUsage: { tokens: 80_000, contextWindow: 100_000 },
        })

        const guidance = assembly.contexts.find(
          (c) => c.name === PROMPT_SECTION_NAMES.CONTEXT_WINDOW_GUIDANCE,
        )
        expect(guidance).toBeDefined()
        expect(guidance?.text).toContain('<context_window_guidance level="warning">')
        expect(guidance?.text).toContain("Current context window usage: 80%")
        expect(guidance?.text).toContain("approx. 20,000 tokens remaining")
        expect(guidance?.text).toContain("Refrain from dumping large files")
        expect(assembly.rendered).toContain('<context_window_guidance level="warning">')
      })

      it("达到或超过 90% 时生成 critical 级别收敛与 /compact 建议 XML 块", async () => {
        const manager = createDefaultSystemPromptManager()
        const assembly = await manager.assemble({
          contextUsage: { tokens: 95_000, contextWindow: 100_000 },
        })

        const guidance = assembly.contexts.find(
          (c) => c.name === PROMPT_SECTION_NAMES.CONTEXT_WINDOW_GUIDANCE,
        )
        expect(guidance).toBeDefined()
        expect(guidance?.text).toContain('<context_window_guidance level="critical">')
        expect(guidance?.text).toContain("Current context window usage: 95%")
        expect(guidance?.text).toContain("approx. 5,000 tokens remaining")
        expect(guidance?.text).toContain("CRITICAL: You are near the maximum context capacity")
        expect(guidance?.text).toContain("/compact")
        expect(assembly.rendered).toContain('<context_window_guidance level="critical">')
      })
    })

    describe("协作模式指令段注入 (Collaboration Modes)", () => {
      it("处于 review 模式时注入只读审查契约与默认审查目标", async () => {
        const manager = createDefaultSystemPromptManager()
        const assembly = await manager.assemble({
          collaborationMode: "review",
        })

        expect(assembly.rendered).toContain(
          "# Collaboration Mode: Review Mode (Strictly Read-Only Audit)",
        )
        expect(assembly.rendered).toContain("## Default Review Target")
        expect(assembly.rendered).toContain(
          "current uncommitted changes (staged, unstaged, and untracked files)",
        )
        expect(assembly.rendered).toContain("<review_findings>")
      })

      it("处于 design 模式时注入 Front Design 指令并要求输出 <front_design>", async () => {
        const manager = createDefaultSystemPromptManager()
        const assembly = await manager.assemble({
          collaborationMode: "design",
        })

        expect(assembly.rendered).toContain("# Collaboration Mode: Front Design Mode")
        expect(assembly.rendered).toContain("<front_design")
        expect(assembly.rendered).toContain("</front_design>")
      })

      it("design 模式默认以 <current_design> 为修改基线，显式新建才省略 parent_id", async () => {
        const manager = createDefaultSystemPromptManager()
        const assembly = await manager.assemble({
          collaborationMode: "design",
        })

        expect(assembly.rendered).toContain("MODIFICATION BASELINE: <current_design>")
        expect(assembly.rendered).toContain("Default Behavior: Modify, Do Not Recreate")
        expect(assembly.rendered).toContain("NEW DESIGN EXCEPTION")
        expect(assembly.rendered).toContain("WITHOUT `parent_id`")
        expect(assembly.rendered).toContain("<referenced_design>")
        expect(assembly.rendered).toContain("take precedence over `<current_design>`")
      })

      it("design 模式局部修改必须走 <front_design_update>，并优先复用大纲选择器", async () => {
        const manager = createDefaultSystemPromptManager()
        const assembly = await manager.assemble({
          collaborationMode: "design",
        })

        expect(assembly.rendered).toContain("<design_outline>")
        expect(assembly.rendered).toContain("LOCALIZED CHANGE (the common case)")
        expect(assembly.rendered).toContain("copied VERBATIM from `<design_outline>`")
        expect(assembly.rendered).toContain("DOCUMENT-WIDE CHANGE (exception)")
        expect(assembly.rendered).toContain("REQUIRED channel for localized modifications")
        expect(assembly.rendered).toContain(
          "if the selector does not resolve, the update is discarded",
        )
      })

      it("design 模式新增内容必须走 append/prepend/before/after 补丁而非重写", async () => {
        const manager = createDefaultSystemPromptManager()
        const assembly = await manager.assemble({
          collaborationMode: "design",
        })

        expect(assembly.rendered).toContain("ADDING content is a localized change too")
        expect(assembly.rendered).toContain("NEVER regenerate the document just to add something")
        expect(assembly.rendered).toContain("`action` selects how the fragment attaches")
        expect(assembly.rendered).toContain(
          "`append` / `prepend`: the fragment is inserted inside the target",
        )
        expect(assembly.rendered).toContain(
          "`before` / `after`: the fragment is inserted as a sibling",
        )
        expect(assembly.rendered).toContain("never rename the document title")
      })

      it("design 模式意图含糊时要求先调用 question 工具澄清", async () => {
        const manager = createDefaultSystemPromptManager()
        const assembly = await manager.assemble({
          collaborationMode: "design",
        })

        expect(assembly.rendered).toContain("AMBIGUOUS INTENT")
        expect(assembly.rendered).toContain("call the `question` tool to clarify BEFORE generating")
        expect(assembly.rendered).toContain("do NOT emit `<front_design>` in that turn")
      })

      it("design 模式注入布局完整性契约，禁止内容贴左上角", async () => {
        const manager = createDefaultSystemPromptManager()
        const assembly = await manager.assemble({
          collaborationMode: "design",
        })

        expect(assembly.rendered).toContain("LAYOUT COMPLETENESS & VISUAL BALANCE")
        expect(assembly.rendered).toContain("centers NOTHING")
        expect(assembly.rendered).toContain("min-h-screen flex items-center justify-center")
        expect(assembly.rendered).toContain("min-height: 100vh; display: flex")
        expect(assembly.rendered).toContain("Content glued to the top-left corner")
      })

      it("design 模式声明 wireframe 工具禁用，布局必须直接走 <front_design>", async () => {
        const manager = createDefaultSystemPromptManager()
        const assembly = await manager.assemble({
          collaborationMode: "design",
        })

        expect(assembly.rendered).toContain("The `wireframe` tool is DISABLED in Front Design Mode")
        expect(assembly.rendered).toContain("Never call it")
      })

      it("minimal 模式独占提示词：仅注入终端约定，压掉其余全部段与上下文", async () => {
        const manager = createDefaultSystemPromptManager()
        const assembly = await manager.assemble({
          collaborationMode: "minimal",
          cwd: "/tmp/minimal-project",
          activeSkills: [
            {
              name: "deploy",
              description: "Deploy helper",
              filePath: "/tmp/skills/deploy/SKILL.md",
              baseDir: "/tmp/skills/deploy",
              disableModelInvocation: false,
            },
          ],
          contextUsage: { tokens: 1000, contextWindow: 200000 },
        })

        expect(assembly.sections).toHaveLength(1)
        expect(assembly.sections[0]?.name).toBe(PROMPT_SECTION_NAMES.MINIMAL_MODE)
        expect(assembly.contexts).toEqual([])
        expect(assembly.rendered).toBe(MINIMAL_MODE_PROMPT)
        // 身份 / 行为规范 / 人格与操作规范 / 技能 / 环境上下文全部被压掉。
        expect(assembly.rendered).not.toContain("<identity>")
        expect(assembly.rendered).not.toContain("<operating_principles>")
        expect(assembly.rendered).not.toContain("<available_skills>")
        expect(assembly.rendered).not.toContain("<env>")
      })

      it("非 minimal 模式不注入独占段，常规分层与各模式互不影响", async () => {
        const manager = createDefaultSystemPromptManager()
        for (const mode of ["build", "plan", "review", "design"] as const) {
          const assembly = await manager.assemble({ collaborationMode: mode })
          expect(assembly.rendered).not.toContain("You have exactly one tool: bash")
          expect(
            assembly.sections.some((section) => section.name === PROMPT_SECTION_NAMES.MINIMAL_MODE),
          ).toBe(false)
        }

        const build = await manager.assemble({ collaborationMode: "build" })
        expect(build.rendered).toContain("<identity>")
        expect(build.rendered).toContain('<collaboration_mode name="build">')
      })
    })
  })

  describe("外部文本原样注入 (literal sections)", () => {
    it("literal 段跳过插值，{{name}}/{{#if}}/非法变量名原样保留且不抛错", () => {
      const manager = new SystemPromptManager()
      manager.registerSection({
        name: "external",
        order: 0,
        literal: true,
        text: "Use {{unknown_var}}, {{#if feature}}x{{/if}}, {{123bad}} and a lone {{ literally.",
      })

      const rendered = manager.renderSync({})
      expect(rendered).toContain("{{unknown_var}}")
      expect(rendered).toContain("{{#if feature}}")
      expect(rendered).toContain("{{123bad}}")
      expect(rendered).toContain("a lone {{ literally")
    })

    it("literal 段在异步装配路径同样跳过插值", async () => {
      const manager = new SystemPromptManager()
      manager.registerSection({
        name: "external",
        order: 0,
        literal: true,
        text: "Keep {{unknown_var}} as-is",
      })

      const assembly = await manager.assemble({})
      expect(assembly.rendered).toBe("Keep {{unknown_var}} as-is")
    })

    it("literal context 同样跳过插值", async () => {
      const manager = new SystemPromptManager()
      manager.registerContext({
        name: "external-context",
        order: 0,
        literal: true,
        text: "Context {{unknown_var}}",
      })

      expect(manager.renderSync({})).toContain("Context {{unknown_var}}")
      const assembly = await manager.assemble({})
      expect(assembly.rendered).toBe("Context {{unknown_var}}")
    })

    it("受控模板（未标记 literal）遇到未注册变量仍严格抛错", () => {
      const manager = new SystemPromptManager()
      manager.registerSection({
        name: "controlled",
        order: 0,
        text: "Hello {{unknown_var}}",
      })

      expect(() => manager.renderSync({})).toThrow(/unknown prompt variable/)
      expect(() => manager.renderSync({})).toThrow(/"controlled"/)
    })
  })

  describe("默认管理器的外部内容段 (literal)", () => {
    it("技能描述含 {{...}} 模板文本时不抛错且原样注入", async () => {
      const manager = createDefaultSystemPromptManager()
      const assembly = await manager.assemble({
        activeSkills: [
          {
            name: "templated-skill",
            description: "Uses {{unknown_var}} and {{#if feature}} blocks",
            filePath: "/path/to/SKILL.md",
            baseDir: "/path/to",
            disableModelInvocation: false,
          },
        ],
      })

      const skills = assembly.sections.find((s) => s.name === PROMPT_SECTION_NAMES.SKILLS)
      expect(skills?.text).toContain("{{unknown_var}}")
      expect(skills?.text).toContain("{{#if feature}}")
    })

    it("记忆 XML 原文含 {{...}} 模板文本时不抛错且原样注入", async () => {
      const cwd = await mkdtemp(join(tmpdir(), "lx-prompt-memory-"))
      try {
        const userRoot = join(cwd, "user-memory")
        await mkdir(userRoot, { recursive: true })
        await writeFile(
          join(userRoot, "memory.xml"),
          [
            "<memories>",
            '  <memory type="user" name="tpl">Remember {{name}} and {{#if x}} rules</memory>',
            "</memories>",
          ].join("\n"),
          "utf-8",
        )

        const manager = createDefaultSystemPromptManager({ userMemoryRoot: userRoot })
        const assembly = await manager.assemble({ cwd })

        const memory = assembly.sections.find(
          (s) => s.name === PROMPT_SECTION_NAMES.WORKSPACE_MEMORY,
        )
        expect(memory?.text).toContain("{{name}}")
        expect(memory?.text).toContain("{{#if x}}")
        expect(memory?.text).toContain("<memory_guidance>")
      } finally {
        await rm(cwd, { recursive: true, force: true })
      }
    })
  })
})
