import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ appDataRoot: "", standardSkillsDir: "" }))
const trashItem = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock("electron", () => ({ shell: { trashItem } }))
vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return {
    ...actual,
    getAppDataRoot: () => holder.appDataRoot,
    getStandardSkillsDir: () => holder.standardSkillsDir,
  }
})

import {
  deleteSkillFile,
  deleteSkillSafe,
  findSkillsRoot,
  importSkillFiles,
  isSkillWorkspaceDir,
  listSkillFiles,
  moveSkillFile,
  readSkillFile,
  saveSkill,
  writeSkillFile,
} from "@/services/skillWorkspaceService"

let tempDir = ""
let lxSkillsRoot = ""
let agentsSkillsRoot = ""
let projectDir = ""

beforeEach(() => {
  trashItem.mockClear()
  tempDir = mkdtempSync(join(tmpdir(), "skill-workspace-test-"))
  holder.appDataRoot = join(tempDir, ".lx")
  holder.standardSkillsDir = join(tempDir, "home", ".agents", "skills")
  lxSkillsRoot = join(holder.appDataRoot, "skills")
  agentsSkillsRoot = holder.standardSkillsDir
  projectDir = join(tempDir, "project")
  mkdirSync(projectDir, { recursive: true })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

// 写入一个最小可用的 SKILL.md。
const writeSkill = (dir: string, name: string, description = "测试技能", body = "body"): void => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    dir + "/SKILL.md",
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`,
  )
}

describe("saveSkill", () => {
  it("新建 skill：写盘 SKILL.md 并返回目录，正文与 frontmatter 正确", () => {
    const result = saveSkill({
      scope: "user",
      targetRoot: "lx",
      name: "pdf-tools",
      description: "处理 PDF",
      displayName: "PDF 工具",
      shortDescription: "PDF 简述",
      disableModelInvocation: true,
      content: "# 用法\n\n执行步骤",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.baseDir).toBe(join(lxSkillsRoot, "pdf-tools"))
    const fileContent = readFileSync(result.filePath, "utf8")
    expect(fileContent).toContain("name: pdf-tools")
    expect(fileContent).toContain("description: 处理 PDF")
    expect(fileContent).toContain("display-name: PDF 工具")
    expect(fileContent).toContain("short-description: PDF 简述")
    expect(fileContent).toContain("disable-model-invocation: true")
    expect(fileContent).toContain("# 用法")
  })

  it("更新已有 skill：保留未知 frontmatter 键，正文缺省时保持不变", () => {
    const skillDir = join(lxSkillsRoot, "legacy")
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "name: legacy",
        "description: 旧描述",
        "license: Apache-2.0",
        "allowed-tools:",
        "  - Bash",
        "metadata:",
        "  version: '1.2'",
        "---",
        "",
        "旧正文",
        "",
      ].join("\n"),
    )

    const result = saveSkill({
      scope: "user",
      targetRoot: "lx",
      originalDir: skillDir,
      originalName: "legacy",
      name: "legacy",
      description: "新描述",
      disableModelInvocation: false,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const saved = readFileSync(result.filePath, "utf8")
    expect(saved).toContain("新描述")
    expect(saved).toContain("license: Apache-2.0")
    expect(saved).toContain("allowed-tools")
    expect(saved).toContain("version: '1.2'")
    expect(saved).toContain("旧正文")
  })

  it("重命名即重命名目录，附带文件跟随迁移", () => {
    const skillDir = join(lxSkillsRoot, "old-name")
    writeSkill(skillDir, "old-name")
    mkdirSync(join(skillDir, "references"), { recursive: true })
    writeFileSync(join(skillDir, "references", "api.md"), "# API")

    const result = saveSkill({
      scope: "user",
      targetRoot: "lx",
      originalDir: skillDir,
      originalName: "old-name",
      name: "new-name",
      description: "重命名测试",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(existsSync(skillDir)).toBe(false)
    expect(existsSync(join(lxSkillsRoot, "new-name", "references", "api.md"))).toBe(true)
  })

  it("名称非法 / 描述为空 / 目标已存在时返回错误", () => {
    expect(
      saveSkill({ scope: "user", targetRoot: "lx", name: "Bad Name", description: "x" }).ok,
    ).toBe(false)
    expect(
      saveSkill({ scope: "user", targetRoot: "lx", name: "ok-name", description: "  " }).ok,
    ).toBe(false)

    writeSkill(join(lxSkillsRoot, "taken"), "taken")
    const conflict = saveSkill({
      scope: "user",
      targetRoot: "lx",
      originalName: "taken",
      name: "taken-2",
      description: "x",
    })
    writeSkill(join(lxSkillsRoot, "taken-2"), "taken-2")
    const renamed = saveSkill({
      scope: "user",
      targetRoot: "lx",
      originalDir: join(lxSkillsRoot, "taken"),
      originalName: "taken",
      name: "taken-2",
      description: "x",
    })
    expect(conflict.ok).toBe(true)
    expect(renamed.ok).toBe(false)
  })

  it("项目作用域写入 .agents 目录，项目路径不存在时报错", () => {
    const result = saveSkill({
      scope: "project",
      projectPath: projectDir,
      targetRoot: "agents",
      name: "proj-skill",
      description: "项目技能",
      content: "正文",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.baseDir).toBe(join(projectDir, ".agents", "skills", "proj-skill"))
    expect(savedFileContains(result.baseDir, "name: proj-skill")).toBe(true)

    const missing = saveSkill({
      scope: "project",
      projectPath: join(tempDir, "not-exist"),
      targetRoot: "lx",
      name: "x-skill",
      description: "x",
    })
    expect(missing.ok).toBe(false)
  })
})

const savedFileContains = (baseDir: string, text: string): boolean =>
  readFileSync(join(baseDir, "SKILL.md"), "utf8").includes(text)

describe("文件树与文件读写", () => {
  it("listSkillFiles 跳过隐藏项与 node_modules，含嵌套目录", () => {
    const skillDir = join(lxSkillsRoot, "tree-skill")
    writeSkill(skillDir, "tree-skill")
    mkdirSync(join(skillDir, "references"), { recursive: true })
    writeFileSync(join(skillDir, "references", "api.md"), "# API")
    mkdirSync(join(skillDir, "node_modules"), { recursive: true })
    writeFileSync(join(skillDir, "node_modules", "dep.js"), "// dep")
    writeFileSync(join(skillDir, ".hidden"), "x")

    const entries = listSkillFiles(skillDir)
    const paths = entries.map((entry) => entry.relativePath)

    expect(paths).toContain("SKILL.md")
    expect(paths).toContain("references")
    expect(paths).toContain("references/api.md")
    expect(paths).not.toContain("node_modules")
    expect(paths).not.toContain(".hidden")
  })

  it("writeSkillFile 自动建父目录、拒绝逃逸路径与 SKILL.md，脚本补可执行位", () => {
    const skillDir = join(lxSkillsRoot, "write-skill")
    writeSkill(skillDir, "write-skill")

    expect(writeSkillFile(skillDir, "../escape.md", "x").ok).toBe(false)
    expect(writeSkillFile(skillDir, "SKILL.md", "x").ok).toBe(false)

    const written = writeSkillFile(skillDir, "scripts/run.sh", "#!/bin/sh\necho ok\n")
    expect(written.ok).toBe(true)
    const scriptPath = join(skillDir, "scripts", "run.sh")
    expect(existsSync(scriptPath)).toBe(true)
    if (process.platform !== "win32") {
      expect(statSync(scriptPath).mode & 0o111).toBeGreaterThan(0)
    }
  })

  it("readSkillFile 拒绝二进制与超大文件", () => {
    const skillDir = join(lxSkillsRoot, "read-skill")
    writeSkill(skillDir, "read-skill")

    expect(readSkillFile(skillDir, "SKILL.md").ok).toBe(true)

    writeFileSync(join(skillDir, "logo.png"), Buffer.from([0x89, 0x50, 0x00, 0x0d]))
    const binary = readSkillFile(skillDir, "logo.png")
    expect(binary.ok).toBe(false)

    writeFileSync(join(skillDir, "big.txt"), "x".repeat(600 * 1024))
    const big = readSkillFile(skillDir, "big.txt")
    expect(big.ok).toBe(false)
  })

  it("deleteSkillFile 拒绝 SKILL.md 且合法文件走废纸篓", async () => {
    const skillDir = join(lxSkillsRoot, "delete-file-skill")
    writeSkill(skillDir, "delete-file-skill")
    writeFileSync(join(skillDir, "notes.md"), "# notes")

    expect(await deleteSkillFile(skillDir, "SKILL.md")).toEqual({
      ok: false,
      error: expect.any(String),
    })
    expect(await deleteSkillFile(skillDir, "missing.md")).toEqual({
      ok: false,
      error: expect.any(String),
    })

    const result = await deleteSkillFile(skillDir, "notes.md")
    expect(result.ok).toBe(true)
    expect(trashItem).toHaveBeenCalledWith(join(skillDir, "notes.md"))
  })

  it("moveSkillFile 移动成功、SKILL.md 拒绝、目标已存在报错", () => {
    const skillDir = join(lxSkillsRoot, "move-skill")
    writeSkill(skillDir, "move-skill")
    writeFileSync(join(skillDir, "api.md"), "# api")
    writeFileSync(join(skillDir, "dup.md"), "# dup")

    expect(moveSkillFile(skillDir, "SKILL.md", "SKILL2.md").ok).toBe(false)
    expect(moveSkillFile(skillDir, "api.md", "dup.md").ok).toBe(false)

    const moved = moveSkillFile(skillDir, "api.md", "references/api.md")
    expect(moved.ok).toBe(true)
    expect(existsSync(join(skillDir, "references", "api.md"))).toBe(true)
  })

  it("importSkillFiles 复制文件并按需追加后缀避免覆盖", () => {
    const skillDir = join(lxSkillsRoot, "import-skill")
    writeSkill(skillDir, "import-skill")
    mkdirSync(join(skillDir, "assets"), { recursive: true })
    writeFileSync(join(skillDir, "assets", "logo.png"), "original")

    const sourceDir = join(tempDir, "sources")
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(join(sourceDir, "logo.png"), "new-bytes")
    writeFileSync(join(sourceDir, "data.json"), "{}")

    const result = importSkillFiles(skillDir, "assets", [
      join(sourceDir, "logo.png"),
      join(sourceDir, "data.json"),
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files).toEqual(["assets/logo-1.png", "assets/data.json"])
    expect(readFileSync(join(skillDir, "assets", "logo-1.png"), "utf8")).toBe("new-bytes")
  })

  it("importSkillFiles 源不存在 / 跳过非文件时报错，目标路径逃逸被拒绝", () => {
    const skillDir = join(lxSkillsRoot, "import-guard")
    writeSkill(skillDir, "import-guard")

    expect(importSkillFiles(skillDir, "", [join(tempDir, "ghost.txt")]).ok).toBe(false)
    expect(importSkillFiles(skillDir, "../escape", [join(tempDir, "x.txt")]).ok).toBe(false)
    expect(importSkillFiles(skillDir, "", []).ok).toBe(false)
  })
})

describe("工作区校验与安全删除", () => {
  it("isSkillWorkspaceDir / findSkillsRoot 识别受支持目录", () => {
    const skillDir = join(agentsSkillsRoot, "agent-skill")
    writeSkill(skillDir, "agent-skill")

    expect(findSkillsRoot(skillDir)).toBe(agentsSkillsRoot)
    expect(isSkillWorkspaceDir(skillDir)).toBe(true)
    expect(isSkillWorkspaceDir(agentsSkillsRoot)).toBe(false)
    expect(isSkillWorkspaceDir(join(tempDir, "random"))).toBe(false)
    expect(isSkillWorkspaceDir(projectDir)).toBe(false)
  })

  it("deleteSkillSafe 允许四个受支持根目录下的 skill", async () => {
    const userSkill = join(lxSkillsRoot, "user-skill")
    writeSkill(userSkill, "user-skill")
    await deleteSkillSafe(join(userSkill, "SKILL.md"))
    expect(trashItem).toHaveBeenCalledWith(userSkill)

    const agentsSkill = join(agentsSkillsRoot, "std-skill")
    writeSkill(agentsSkill, "std-skill")
    await deleteSkillSafe(agentsSkill)
    expect(trashItem).toHaveBeenCalledWith(agentsSkill)

    const projectSkill = join(projectDir, ".lx", "skills", "proj")
    writeSkill(projectSkill, "proj")
    await deleteSkillSafe(join(projectSkill, "SKILL.md"))
    expect(trashItem).toHaveBeenCalledWith(projectSkill)
  })

  it("deleteSkillSafe 拒绝任意目录、skills 根与不存在路径", async () => {
    const arbitrary = join(tempDir, "arbitrary", "SKILL.md")
    writeSkill(join(tempDir, "arbitrary"), "arbitrary")
    expect((await deleteSkillSafe(arbitrary)).success).toBe(false)

    mkdirSync(lxSkillsRoot, { recursive: true })
    expect((await deleteSkillSafe(join(lxSkillsRoot, "SKILL.md"))).success).toBe(false)

    expect((await deleteSkillSafe(join(lxSkillsRoot, "ghost", "SKILL.md"))).success).toBe(false)

    expect(trashItem).not.toHaveBeenCalled()
  })
})
