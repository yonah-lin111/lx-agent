import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { LoadedSkill } from "@/agent/skills/skillLoader"

let appDataRoot = ""

vi.mock("@/paths", () => ({
  getAppDataRoot: () => appDataRoot,
  getConfigPath: () => join(appDataRoot, "config.json"),
}))

// 动态导入以拾取 mock（vi.resetModules 后每次拿到新单例）。
const importLoader = (): Promise<typeof import("@/agent/skills/skillLoader")> =>
  import("@/agent/skills/skillLoader")

let rootDir = ""
let projectCwd = ""

beforeEach(() => {
  vi.resetModules()
  rootDir = mkdtempSync(join(tmpdir(), "lx-skills-"))
  appDataRoot = rootDir
  projectCwd = join(rootDir, "project")
  mkdirSync(projectCwd, { recursive: true })
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

// 写入 user 级 skill：<appDataRoot>/skills/<name>/SKILL.md。
const writeUserSkill = (
  name: string,
  frontmatter: Record<string, unknown>,
  body = "正文",
): string => {
  const dir = join(rootDir, "skills", name)
  mkdirSync(dir, { recursive: true })
  const fm = Object.entries(frontmatter)
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === "boolean" ? (value ? "true" : "false") : JSON.stringify(value)}`,
    )
    .join("\n")
  const filePath = join(dir, "SKILL.md")
  writeFileSync(filePath, `---\n${fm}\n---\n\n${body}\n`)
  return filePath
}

describe("skillLoader", () => {
  it("SKILL.md 根约定：name 缺省用目录名，frontmatter name 优先", async () => {
    const { skillLoader } = await importLoader()
    writeUserSkill("my-skill", { description: "测试 skill" })
    writeUserSkill("named-skill", { name: "renamed", description: "测试" })

    const skills = skillLoader.load(projectCwd)
    const byName = new Map(skills.map((skill) => [skill.name, skill]))
    expect(byName.get("my-skill")).toMatchObject({ baseDir: join(rootDir, "skills", "my-skill") })
    expect(byName.get("renamed")).toBeDefined()
    expect(skills).toHaveLength(2)
  })

  it("目录无 SKILL.md：加载根目录直接 .md 子文件并递归子目录，非 SKILL.md 子文件不加载", async () => {
    const { skillLoader } = await importLoader()
    mkdirSync(join(rootDir, "skills"), { recursive: true })
    // 根目录直接 .md 子文件（includeRootFiles=true 加载）。
    writeFileSync(
      join(rootDir, "skills", "top-note.md"),
      "---\nname: top-note\ndescription: 根级笔记\n---\n\nbody\n",
    )
    mkdirSync(join(rootDir, "skills", "nested", "sub"), { recursive: true })
    writeFileSync(
      join(rootDir, "skills", "nested", "sub", "SKILL.md"),
      "---\nname: sub-skill\ndescription: 递归命中\n---\n\nbody\n",
    )
    // 子目录内非 SKILL.md 的 .md 不加载（includeRootFiles=false）。
    writeFileSync(
      join(rootDir, "skills", "nested", "plain.md"),
      "---\nname: plain\ndescription: 不应加载\n---\n\nbody\n",
    )

    const names = skillLoader.load(projectCwd).map((skill) => skill.name)
    expect(names).toEqual(expect.arrayContaining(["top-note", "sub-skill"]))
    expect(names).not.toContain("plain")
  })

  it("description 缺失不加载；name 违规仍加载（警告）", async () => {
    const { skillLoader } = await importLoader()
    writeUserSkill("no-desc", { name: "no-desc" })
    writeUserSkill("BAD_Name", { description: "违规名仍加载" })

    const skills = skillLoader.load(projectCwd)
    expect(skills.map((skill) => skill.name)).toEqual(["BAD_Name"])
  })

  it("disable-model-invocation 标记", async () => {
    const { skillLoader } = await importLoader()
    writeUserSkill("quiet", { description: "仅显式", "disable-model-invocation": true })
    const skill = skillLoader.get("quiet", projectCwd)
    expect(skill?.disableModelInvocation).toBe(true)
  })

  it("user / project 同名冲突：user 优先", async () => {
    const { skillLoader } = await importLoader()
    const userPath = writeUserSkill("dup", { description: "user 版本" })
    const projectDir = join(projectCwd, ".lx", "skills", "dup")
    mkdirSync(projectDir, { recursive: true })
    const projectPath = join(projectDir, "SKILL.md")
    writeFileSync(projectPath, "---\nname: dup\ndescription: project 版本\n---\n\nbody\n")

    const skill = skillLoader.get("dup", projectCwd)
    expect(skill?.filePath).toBe(userPath)
    expect(skill?.filePath).not.toBe(projectPath)
  })

  it("user / project 来源重合（cwd 下 .lx 即 appDataRoot）：同一文件重复扫描不报冲突", async () => {
    appDataRoot = join(rootDir, ".lx")
    const { skillLoader } = await importLoader()
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const userDir = join(appDataRoot, "skills", "grill-me")
    mkdirSync(userDir, { recursive: true })
    writeFileSync(
      join(userDir, "SKILL.md"),
      "---\nname: grill-me\ndescription: 测试\n---\n\nbody\n",
    )

    // cwd 指向 appDataRoot 的父目录：<cwd>/.lx/skills 与 user skills 是同一目录。
    const skills = skillLoader.load(rootDir)
    expect(skills.map((skill) => skill.name)).toEqual(["grill-me"])
    expect(warnSpy.mock.calls.map((call) => call[0])).not.toContain(
      expect.stringContaining("名称冲突"),
    )
    warnSpy.mockRestore()
  })

  it("formatSkillsForPrompt：排除 disable-model-invocation、拼 XML 块、描述截断 1024", async () => {
    const { formatSkillsForPrompt } = await importLoader()
    const longDescription = "x".repeat(2000)
    const skills: LoadedSkill[] = [
      {
        name: "a",
        description: "第一个",
        filePath: "/p/a/SKILL.md",
        baseDir: "/p/a",
        disableModelInvocation: false,
      },
      {
        name: "b",
        description: "仅显式",
        filePath: "/p/b/SKILL.md",
        baseDir: "/p/b",
        disableModelInvocation: true,
      },
      {
        name: "c",
        description: longDescription,
        filePath: "/p/c/SKILL.md",
        baseDir: "/p/c",
        disableModelInvocation: false,
      },
    ]
    const block = formatSkillsForPrompt(skills)

    expect(block).toContain("<available_skills>")
    expect(block).toContain("<name>a</name>")
    expect(block).toContain("<name>c</name>")
    // disable-model-invocation 不进 prompt。
    expect(block).not.toContain("<name>b</name>")
    // 描述截断到 1024。
    expect(block).toContain("x".repeat(1024))
    expect(block).not.toContain("x".repeat(1025))
  })
})
