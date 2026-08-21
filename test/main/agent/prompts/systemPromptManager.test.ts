import { describe, expect, it } from "vitest"
import {
  createDefaultSystemPromptManager,
  interpolateVariables,
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
    it("包含基础身份、Persona 及动态技能与指令分层", async () => {
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
      })

      expect(assembly.sections.some((s) => s.name === PROMPT_SECTION_NAMES.IDENTITY)).toBe(true)
      expect(assembly.sections.some((s) => s.name === PROMPT_SECTION_NAMES.PERSONA)).toBe(true)
      expect(assembly.sections.some((s) => s.name === PROMPT_SECTION_NAMES.SKILLS)).toBe(true)
      expect(assembly.rendered).toContain("你是 LX Agent")
      expect(assembly.rendered).toContain("<available_skills>")
      expect(assembly.rendered).toContain("test-skill")
    })
  })
})
