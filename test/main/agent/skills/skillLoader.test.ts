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

  it("支持 metadata.short-description 解析并在 formatSkillsForPrompt 输出", async () => {
    const { skillLoader, formatSkillsForPrompt } = await importLoader()
    writeUserSkill("skill-with-meta", {
      name: "skill-with-meta",
      description: "完整的长描述说明",
      metadata: { "short-description": "精简简述" },
    })

    const skill = skillLoader.get("skill-with-meta", projectCwd)
    expect(skill?.shortDescription).toBe("精简简述")

    const prompt = formatSkillsForPrompt([skill!])
    expect(prompt).toContain("<short_description>精简简述</short_description>")
  })

  it("支持 agents/skill.yaml 伴随配置（displayName, defaultPrompt, dependencies, policy）", async () => {
    const { skillLoader } = await importLoader()
    const dir = join(rootDir, "skills", "advanced-tool")
    mkdirSync(join(dir, "agents"), { recursive: true })
    writeFileSync(
      join(dir, "SKILL.md"),
      "---\nname: advanced-tool\ndescription: 主说明\n---\n\nbody\n",
    )
    writeFileSync(
      join(dir, "agents", "skill.yaml"),
      `
interface:
  display_name: 高级工具
  short_description: 工具简短说明
  default_prompt: 请帮我调用高级工具
dependencies:
  tools:
    - type: mcp
      value: github
      description: GitHub 集成
policy:
  allow_implicit_invocation: false
`,
    )

    const skill = skillLoader.get("advanced-tool", projectCwd)
    expect(skill).toBeDefined()
    expect(skill?.displayName).toBe("高级工具")
    expect(skill?.shortDescription).toBe("工具简短说明")
    expect(skill?.defaultPrompt).toBe("请帮我调用高级工具")
    expect(skill?.disableModelInvocation).toBe(true)
    expect(skill?.dependencies?.tools).toEqual([
      { type: "mcp", value: "github", description: "GitHub 集成" },
    ])
  })

  it("支持 .agents/skills 标准工作区目录并遵循优先级：user > .lx/skills > .agents/skills", async () => {
    const { skillLoader } = await importLoader()
    // 在 .agents/skills 创建 skill-a 与 dup
    const agentsDir = join(projectCwd, ".agents", "skills")
    mkdirSync(join(agentsDir, "skill-a"), { recursive: true })
    writeFileSync(
      join(agentsDir, "skill-a", "SKILL.md"),
      "---\nname: skill-a\ndescription: agents 目录技能\n---\n\nbody\n",
    )

    mkdirSync(join(agentsDir, "dup-skill"), { recursive: true })
    writeFileSync(
      join(agentsDir, "dup-skill", "SKILL.md"),
      "---\nname: dup-skill\ndescription: agents 版本\n---\n\nbody\n",
    )

    // 在 .lx/skills 覆盖 dup-skill
    const lxDir = join(projectCwd, ".lx", "skills", "dup-skill")
    mkdirSync(lxDir, { recursive: true })
    writeFileSync(
      join(lxDir, "SKILL.md"),
      "---\nname: dup-skill\ndescription: lx 版本\n---\n\nbody\n",
    )

    const skills = skillLoader.load(projectCwd)
    const skillA = skills.find((s) => s.name === "skill-a")
    const dupSkill = skills.find((s) => s.name === "dup-skill")

    expect(skillA).toBeDefined()
    expect(skillA?.description).toBe("agents 目录技能")
    expect(dupSkill).toBeDefined()
    expect(dupSkill?.description).toBe("lx 版本")
  })

  it("extractSkillMentions 提取独立 $name 与 [$name](path) 格式提及", async () => {
    const { extractSkillMentions } = await importLoader()
    const text = "请使用 $git-commit 以及 [$code-review](skill://review) 检查代码，最后 $deploy。"
    const mentions = extractSkillMentions(text)
    expect(mentions).toEqual(expect.arrayContaining(["git-commit", "code-review", "deploy"]))
  })
})
