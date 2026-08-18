import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  inferArgumentHint,
  PromptTemplateLoader,
  parseCommandArgs,
  substituteArgs,
} from "@/agent/prompts/promptTemplateLoader"

const holder = vi.hoisted(() => ({
  appDataRoot: "",
}))

vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return {
    ...actual,
    getAppDataRoot: () => holder.appDataRoot,
  }
})

describe("promptTemplateLoader", () => {
  let tempDir: string
  let userPromptsDir: string
  let projectDir: string
  let projectPromptsDir: string
  let loader: PromptTemplateLoader

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "prompt-template-test-"))
    holder.appDataRoot = join(tempDir, ".lx")
    userPromptsDir = join(holder.appDataRoot, "prompts")
    mkdirSync(userPromptsDir, { recursive: true })

    projectDir = join(tempDir, "workspace")
    projectPromptsDir = join(projectDir, ".lx", "prompts")
    mkdirSync(projectPromptsDir, { recursive: true })

    loader = new PromptTemplateLoader()
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  describe("parseCommandArgs", () => {
    it("parses unquoted arguments separated by spaces", () => {
      expect(parseCommandArgs("foo bar baz")).toEqual(["foo", "bar", "baz"])
    })

    it("parses double quoted and single quoted arguments containing spaces", () => {
      expect(parseCommandArgs("foo \"hello world\" 'single quote' bar")).toEqual([
        "foo",
        "hello world",
        "single quote",
        "bar",
      ])
    })

    it("handles escape characters", () => {
      expect(parseCommandArgs('foo\\ bar "hello \\"world\\""')).toEqual([
        "foo bar",
        'hello "world"',
      ])
    })

    it("returns empty array on empty string or whitespace", () => {
      expect(parseCommandArgs("   ")).toEqual([])
    })
  })

  describe("substituteArgs", () => {
    it("replaces $1, $2 and $@ correctly", () => {
      const template = "Review $1 with focus on $2. All args: $@"
      const result = substituteArgs(template, ["src/index.ts", "security", "extra", "notes"])
      expect(result).toBe(
        "Review src/index.ts with focus on security. All args: src/index.ts security extra notes",
      )
    })

    it("replaces ${N:-default} when arg is missing", () => {
      const template = "Run ${1:-npm test} in ${2:-./src}"
      const result = substituteArgs(template, ["pnpm test"])
      expect(result).toBe("Run pnpm test in ./src")
    })

    it("replaces ${@:-default} when no args provided", () => {
      const template = "Target: ${@:-all}"
      expect(substituteArgs(template, [])).toBe("Target: all")
      expect(substituteArgs(template, ["foo", "bar"])).toBe("Target: foo bar")
    })

    it("supports slice syntax ${@:N} and ${@:N:L}", () => {
      const template = "From 2nd: ${@:2}, Slice 2 items from 2nd: ${@:2:2}"
      const result = substituteArgs(template, ["a", "b", "c", "d", "e"])
      expect(result).toBe("From 2nd: b c d e, Slice 2 items from 2nd: b c")
    })

    it("evaluates unsupplied positional args without default to empty string", () => {
      const template = "Arg1: '$1', Arg2: '$2', Arg3: '$3'"
      const result = substituteArgs(template, ["first"])
      expect(result).toBe("Arg1: 'first', Arg2: '', Arg3: ''")
    })
  })

  describe("load and precedence", () => {
    it("loads global user templates", () => {
      writeFileSync(
        join(userPromptsDir, "review.md"),
        `---
description: 全局审查模板
argument-hint: [file]
---
请审查 $1
`,
      )

      const templates = loader.load(projectDir)
      expect(templates).toHaveLength(1)
      expect(templates[0]).toMatchObject({
        name: "review",
        description: "全局审查模板",
        argumentHint: "[file]",
        content: "请审查 $1",
        source: "user",
      })
    })

    it("overrides user template with project template (Project Overrides User)", () => {
      // 全局定义 review.md
      writeFileSync(
        join(userPromptsDir, "review.md"),
        `---
description: 全局审查模板
---
全局规则: $1
`,
      )

      // 项目专属定义同名 review.md
      writeFileSync(
        join(projectPromptsDir, "review.md"),
        `---
description: 项目专属审查模板
argument-hint: [target_file]
---
项目专属规则: $1
`,
      )

      const templates = loader.load(projectDir)
      expect(templates).toHaveLength(1)
      expect(templates[0]).toMatchObject({
        name: "review",
        description: "项目专属审查模板",
        argumentHint: "[target_file]",
        content: "项目专属规则: $1",
        source: "project",
      })
    })

    it("falls back to first non-empty line if description is missing in frontmatter", () => {
      writeFileSync(
        join(userPromptsDir, "explain.md"),
        `请详细解释以下代码的运行机制与架构。
更多要求：$@
`,
      )

      const templates = loader.load(projectDir)
      expect(templates).toHaveLength(1)
      expect(templates[0].description).toBe("请详细解释以下代码的运行机制与架构。")
    })
  })

  describe("expand", () => {
    it("expands matching prompt template command", () => {
      writeFileSync(
        join(projectPromptsDir, "refactor.md"),
        `---
description: 重构代码
---
请重构 $1，采用最小修改原则。补充：$@
`,
      )

      const expanded = loader.expand("/refactor src/main.ts 保持优雅", projectDir)
      expect(expanded).toBe("请重构 src/main.ts，采用最小修改原则。补充：src/main.ts 保持优雅")
    })

    it("ignores reserved system commands like /clear, /undo, /steer, /model, /compact", () => {
      expect(loader.expand("/clear", projectDir)).toBe("/clear")
      expect(loader.expand("/undo", projectDir)).toBe("/undo")
      expect(loader.expand("/steer hello", projectDir)).toBe("/steer hello")
      expect(loader.expand("/model gpt-4", projectDir)).toBe("/model gpt-4")
      expect(loader.expand("/compact", projectDir)).toBe("/compact")
    })

    it("ignores /skill: commands", () => {
      expect(loader.expand("/skill:my-skill args", projectDir)).toBe("/skill:my-skill args")
    })

    it("returns original text if template does not exist", () => {
      expect(loader.expand("/nonexistent arg1", projectDir)).toBe("/nonexistent arg1")
    })
  })

  describe("inferArgumentHint", () => {
    it("infers multiple indexed arguments like $1 $2", () => {
      expect(inferArgumentHint("请审查 $1 并对比 $2")).toBe("[arg1] [arg2]")
    })

    it("infers arguments with default names like ${1:-target_file} ${2:-rules}", () => {
      expect(inferArgumentHint("请审查 ${1:-target_file} 规则：${2:-rules}")).toBe(
        "[target_file] [rules]",
      )
    })

    it("infers [arguments] for $@ or $ARGUMENTS", () => {
      expect(inferArgumentHint("执行任务：$@")).toBe("[arguments]")
      expect(inferArgumentHint("参数：$ARGUMENTS")).toBe("[arguments]")
    })

    it("returns undefined for static templates without arguments", () => {
      expect(inferArgumentHint("请输出系统架构图。")).toBeUndefined()
    })
  })
})
