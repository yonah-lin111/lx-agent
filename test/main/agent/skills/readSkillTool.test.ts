import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ImageContent, TextContent } from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { skillLoader } from "@/agent/skills/skillLoader"

let appDataRoot = ""

vi.mock("@/paths", () => ({
  getAppDataRoot: () => appDataRoot,
  getConfigPath: () => join(appDataRoot, "config.json"),
}))

let cwd = ""
let rootDir = ""

beforeEach(() => {
  vi.resetModules()
  skillLoader.clearCache()
  rootDir = mkdtempSync(join(tmpdir(), "lx-skilltool-"))
  appDataRoot = rootDir
  cwd = join(rootDir, "project")
  mkdirSync(cwd, { recursive: true })
  mkdirSync(join(rootDir, "skills", "my-skill"), { recursive: true })
  writeFileSync(
    join(rootDir, "skills", "my-skill", "SKILL.md"),
    "---\nname: my-skill\ndescription: 测试\n---\n\n技能正文\n",
  )
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

const importTool = (): Promise<typeof import("@/agent/skills/readSkillTool")> =>
  import("@/agent/skills/readSkillTool")

// 读取工具返回的文本内容。
const resultText = (result: { content: (TextContent | ImageContent)[] }): string => {
  const block = result.content[0]
  return block?.type === "text" ? block.text : ""
}

describe("read_skill 工具", () => {
  it("命中返回 strip frontmatter 后的正文并注明相对路径基准", async () => {
    const { createReadSkillTool } = await importTool()
    const tool = createReadSkillTool(cwd)
    const result = await tool.execute("tc1", { name: "my-skill" })
    expect(resultText(result)).toContain("技能正文")
    expect(resultText(result)).toContain("References are relative to")
  })

  it("未命中返回错误内容并列出可用名", async () => {
    const { createReadSkillTool } = await importTool()
    const tool = createReadSkillTool(cwd)
    const result = await tool.execute("tc1", { name: "nope" })
    expect(resultText(result)).toContain('Skill "nope" not found')
    expect(resultText(result)).toContain("my-skill")
  })

  it("超长正文截断", async () => {
    // 覆盖同文件为超长正文（触发 DEFAULT_MAX_LINES 截断）；fresh 加载器读新内容。
    writeFileSync(
      join(rootDir, "skills", "my-skill", "SKILL.md"),
      `---\nname: my-skill\ndescription: 测试\n---\n\n${"line\n".repeat(3000)}`,
    )
    const { createReadSkillTool } = await importTool()
    const tool = createReadSkillTool(cwd)
    const result = await tool.execute("tc1", { name: "my-skill" })
    expect(resultText(result)).toContain("skill body truncated")
  })

  it("依赖的 MCP 服务未连接时追加警告", async () => {
    writeFileSync(
      join(rootDir, "skills", "my-skill", "SKILL.md"),
      `---\nname: my-skill\ndescription: 测试\n---\n\n技能正文\n`,
    )
    writeFileSync(
      join(rootDir, "skills", "my-skill", "skill.yaml"),
      `interface:\n  dependencies:\n    tools:\n      - type: mcp\n        value: github\n`,
    )
    const { createReadSkillTool } = await importTool()
    const mockMcpManager = {
      getStatus: () => [
        { name: "other-mcp", status: "connected" as const },
      ],
    }
    const tool = createReadSkillTool(cwd, { mcpManager: mockMcpManager as any })
    const result = await tool.execute("tc1", { name: "my-skill" })
    expect(resultText(result)).toContain("requires MCP server(s): github")
  })
})
