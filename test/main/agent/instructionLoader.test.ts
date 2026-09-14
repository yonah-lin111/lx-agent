import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const cpMock = vi.hoisted(() => ({ execSync: vi.fn() }))

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return { ...actual, execSync: cpMock.execSync }
})

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
  cpMock.execSync.mockReset()
  cpMock.execSync.mockImplementation(() => {
    throw new Error("not a git repository")
  })
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

  it("支持 Git 仓库根目录到深层子目录沿途 AGENTS.md 链式加载（根在前，深层在后）", async () => {
    const subDir = join(projectCwd, "packages", "core")
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(projectCwd, "AGENTS.md"), "root rules")
    writeFileSync(join(subDir, "AGENTS.md"), "sub rules")

    const { loadInstructions, getDirectoryChain } = await importLoader()
    const chain = getDirectoryChain(projectCwd, subDir)
    expect(chain).toEqual([
      projectCwd,
      join(projectCwd, "packages"),
      join(projectCwd, "packages", "core"),
    ])

    const result = loadInstructions(subDir)
    expect(result).toBeDefined()
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

  describe("findGitRepoRoot 按 cwd 的短 TTL 缓存", () => {
    it("同一 cwd 在 TTL 内复用结果，过期后重新执行 git", async () => {
      const { findGitRepoRoot, clearGitRepoRootCache, setGitRepoRootCacheClock } =
        await importLoader()
      let now = 1_000
      setGitRepoRootCacheClock(() => now)
      clearGitRepoRootCache()
      cpMock.execSync.mockReturnValue(`${projectCwd}\n`)

      expect(findGitRepoRoot(projectCwd)).toBe(projectCwd)
      now += 4_000
      expect(findGitRepoRoot(projectCwd)).toBe(projectCwd)
      expect(cpMock.execSync).toHaveBeenCalledTimes(1)

      now += 2_000
      expect(findGitRepoRoot(projectCwd)).toBe(projectCwd)
      expect(cpMock.execSync).toHaveBeenCalledTimes(2)
    })

    it("不同 cwd 缓存隔离，失败结果同样被缓存", async () => {
      const { findGitRepoRoot, clearGitRepoRootCache, setGitRepoRootCacheClock } =
        await importLoader()
      setGitRepoRootCacheClock(() => 10_000)
      clearGitRepoRootCache()

      expect(findGitRepoRoot(projectCwd)).toBeUndefined()
      expect(findGitRepoRoot(projectCwd)).toBeUndefined()
      expect(cpMock.execSync).toHaveBeenCalledTimes(1)

      const otherDir = join(projectCwd, "other")
      mkdirSync(otherDir, { recursive: true })
      expect(findGitRepoRoot(otherDir)).toBeUndefined()
      expect(cpMock.execSync).toHaveBeenCalledTimes(2)
    })
  })
})
