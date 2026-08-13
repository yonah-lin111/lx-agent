import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let appDataRoot = ""

vi.mock("@/paths", () => ({
  getAppDataRoot: () => appDataRoot,
}))

// 动态导入以拾取 mock（vi.resetModules 后每次拿到新模块）。
const importLoader = (): Promise<typeof import("@/agent/instructionLoader")> =>
  import("@/agent/instructionLoader")

let rootDir = ""
let projectCwd = ""

beforeEach(() => {
  vi.resetModules()
  rootDir = mkdtempSync(join(tmpdir(), "lx-instr-"))
  appDataRoot = rootDir
  projectCwd = join(rootDir, "project")
  mkdirSync(projectCwd, { recursive: true })
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

describe("instructionLoader", () => {
  it("无指令文件时返回空", async () => {
    const { loadInstructions } = await importLoader()
    expect(loadInstructions(projectCwd)).toEqual([])
  })

  it("加载 user + 项目 AGENTS.md（user 在前）", async () => {
    writeFileSync(join(appDataRoot, "AGENTS.md"), "user rules")
    writeFileSync(join(projectCwd, "AGENTS.md"), "project rules")
    const { loadInstructions } = await importLoader()
    const result = loadInstructions(projectCwd)
    expect(result.map((instruction) => instruction.content)).toEqual([
      "user rules",
      "project rules",
    ])
    expect(result[0]?.path).toBe(join(appDataRoot, "AGENTS.md"))
  })

  it("项目级 AGENTS.md 优先于 CLAUDE.md（命中即停）", async () => {
    writeFileSync(join(projectCwd, "AGENTS.md"), "agents")
    writeFileSync(join(projectCwd, "CLAUDE.md"), "claude")
    const { loadInstructions } = await importLoader()
    expect(loadInstructions(projectCwd).map((instruction) => instruction.content)).toEqual([
      "agents",
    ])
  })

  it("项目级无 AGENTS.md 时回退 CLAUDE.md", async () => {
    writeFileSync(join(projectCwd, "CLAUDE.md"), "claude")
    const { loadInstructions } = await importLoader()
    expect(loadInstructions(projectCwd).map((instruction) => instruction.content)).toEqual([
      "claude",
    ])
  })

  it("空内容/缺失文件静默跳过", async () => {
    writeFileSync(join(projectCwd, "AGENTS.md"), "   \n  ")
    const { loadInstructions } = await importLoader()
    expect(loadInstructions(projectCwd)).toEqual([])
  })

  it("超大文件不抛错且内容有界", async () => {
    const line = "y".repeat(1000)
    writeFileSync(join(projectCwd, "AGENTS.md"), Array.from({ length: 200 }, () => line).join("\n"))
    const { loadInstructions } = await importLoader()
    const result = loadInstructions(projectCwd)
    expect(result).toHaveLength(1)
    expect(result[0]?.content.length).toBeLessThan(200 * 1000)
  })

  it("formatInstructions 拼注入块；空列表返回空串", async () => {
    const { formatInstructions } = await importLoader()
    expect(formatInstructions([])).toBe("")
    const block = formatInstructions([{ path: "/p/AGENTS.md", content: "rules" }])
    expect(block).toContain("Instructions from: /p/AGENTS.md")
    expect(block).toContain("rules")
  })
})
