import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ appDataRoot: "", repoRoot: "" }))

vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return { ...actual, getAppDataRoot: () => holder.appDataRoot }
})
vi.mock("@/agent/instructionLoader", () => ({
  findGitRepoRoot: (_cwd: string) => (holder.repoRoot ? holder.repoRoot : undefined),
  getDirectoryChain: (repoRoot: string, targetDir: string) => [repoRoot, targetDir],
}))

import { getInstruction, saveInstruction } from "@/services/instructionService"

let tempDir = ""
let projectDir = ""

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "instruction-service-test-"))
  holder.appDataRoot = join(tempDir, ".lx")
  holder.repoRoot = join(tempDir, "repo")
  projectDir = join(tempDir, "repo", "apps", "web")
  mkdirSync(projectDir, { recursive: true })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe("instructionService 用户级指令", () => {
  it("文件不存在时返回 exists=false 与 content=null", () => {
    const info = getInstruction("user")

    expect(info.path).toBe(join(holder.appDataRoot, "AGENTS.md"))
    expect(info.exists).toBe(false)
    expect(info.content).toBeNull()
    expect(info.chain).toEqual([])
    expect(info.fallback).toBeNull()
  })

  it("保存时创建目录、统一 LF 并补齐结尾换行", () => {
    saveInstruction({ scope: "user", content: "line1\r\nline2\r\n\r\n" })

    const filePath = join(holder.appDataRoot, "AGENTS.md")
    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath, "utf8")).toBe("line1\nline2\n")

    const info = getInstruction("user")
    expect(info.exists).toBe(true)
    expect(info.content).toBe("line1\nline2\n")
  })

  it("清空内容写入空文件", () => {
    saveInstruction({ scope: "user", content: "x" })
    saveInstruction({ scope: "user", content: "   " })
    expect(readFileSync(join(holder.appDataRoot, "AGENTS.md"), "utf8")).toBe("")
  })
})

describe("instructionService 项目级指令", () => {
  it("只读链仅包含项目父级 AGENTS.md，fallback 在缺失时生效", () => {
    const repoAgents = join(holder.repoRoot, "AGENTS.md")
    writeFileSync(repoAgents, "repo rules\n")
    writeFileSync(join(projectDir, "CLAUDE.md"), "claude rules\n")

    const info = getInstruction("project", projectDir)

    expect(info.path).toBe(join(projectDir, "AGENTS.md"))
    expect(info.exists).toBe(false)
    expect(info.content).toBeNull()
    expect(info.chain).toEqual([{ path: repoAgents, exists: true }])
    expect(info.fallback).toEqual({
      path: join(projectDir, "CLAUDE.md"),
      content: "claude rules\n",
    })
  })

  it("目标存在时不再展示 fallback", () => {
    writeFileSync(join(holder.repoRoot, "AGENTS.md"), "repo rules\n")
    writeFileSync(join(projectDir, "AGENTS.md"), "project rules\n")
    writeFileSync(join(projectDir, "CLAUDE.md"), "claude rules\n")

    const info = getInstruction("project", projectDir)

    expect(info.exists).toBe(true)
    expect(info.content).toBe("project rules\n")
    expect(info.fallback).toBeNull()
    expect(info.chain).toHaveLength(1)
  })

  it("无 git 仓库时链为空，保存后创建项目根 AGENTS.md", () => {
    holder.repoRoot = ""
    const info = getInstruction("project", projectDir)
    expect(info.chain).toEqual([])

    const saved = saveInstruction({
      scope: "project",
      projectPath: projectDir,
      content: "project instructions",
    })
    expect(saved.exists).toBe(true)
    expect(readFileSync(join(projectDir, "AGENTS.md"), "utf8")).toBe("project instructions\n")
  })

  it("项目路径缺失或不存在时抛出错误", () => {
    expect(() => getInstruction("project")).toThrow()
    expect(() => getInstruction("project", join(tempDir, "ghost"))).toThrow()
    expect(() => saveInstruction({ scope: "project", content: "x" })).toThrow()
  })
})
