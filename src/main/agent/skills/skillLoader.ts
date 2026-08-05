import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import matter from "gray-matter"
import ignore from "ignore"
import { getAppDataRoot } from "@/paths"

// 已加载的 skill（正文按需读取，不在加载时驻留）。
export type LoadedSkill = {
  name: string
  description: string
  filePath: string
  baseDir: string
  disableModelInvocation: boolean
}

// 名称长度上限（对齐 pi / Agent Skills spec）。
const MAX_NAME_LENGTH = 64

// 描述长度上限（超过记警告仍加载；注入时再截断）。
const MAX_DESCRIPTION_LENGTH = 1024

// 遵循的 ignore 文件（对齐 pi）。
const IGNORE_FILE_NAMES = [".gitignore", ".ignore", ".fdignore"]

type IgnoreMatcher = ReturnType<typeof ignore>

const toPosixPath = (value: string): string => value.split(sep).join("/")

// ignore 规则前缀化（对齐 pi：子目录规则需加相对路径前缀）。
const prefixIgnorePattern = (line: string, prefix: string): string | null => {
  const trimmed = line.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("#") && !trimmed.startsWith("\\#")) return null

  let pattern = line
  let negated = false
  if (pattern.startsWith("!")) {
    negated = true
    pattern = pattern.slice(1)
  } else if (pattern.startsWith("\\!")) {
    pattern = pattern.slice(1)
  }
  if (pattern.startsWith("/")) pattern = pattern.slice(1)

  const prefixed = prefix ? `${prefix}${pattern}` : pattern
  return negated ? `!${prefixed}` : prefixed
}

// 收集目录下 .gitignore/.ignore/.fdignore 规则。
const addIgnoreRules = (matcher: IgnoreMatcher, dir: string, rootDir: string): void => {
  const relativeDir = relative(rootDir, dir)
  const prefix = relativeDir ? `${toPosixPath(relativeDir)}/` : ""
  for (const filename of IGNORE_FILE_NAMES) {
    const ignorePath = join(dir, filename)
    if (!existsSync(ignorePath)) continue
    try {
      const patterns = readFileSync(ignorePath, "utf8")
        .split(/\r?\n/)
        .map((line) => prefixIgnorePattern(line, prefix))
        .filter((line): line is string => Boolean(line))
      if (patterns.length > 0) matcher.add(patterns)
    } catch {
      // 读取失败的 ignore 文件跳过。
    }
  }
}

// 校验 skill 名称：小写 a-z0-9 连字符、≤64、首尾非连字符、无连续连字符。
const validateName = (name: string): string[] => {
  const errors: string[] = []
  if (name.length > MAX_NAME_LENGTH)
    errors.push(`name 超过 ${MAX_NAME_LENGTH} 字符 (${name.length})`)
  if (!/^[a-z0-9-]+$/.test(name)) errors.push("name 只能包含小写 a-z、0-9 与连字符")
  if (name.startsWith("-") || name.endsWith("-")) errors.push("name 不能以连字符开头或结尾")
  if (name.includes("--")) errors.push("name 不能包含连续连字符")
  return errors
}

// 校验描述：必填；超长仅记警告仍加载。
const validateDescription = (description: string | undefined): string[] => {
  const errors: string[] = []
  if (!description || description.trim() === "") errors.push("description 必填")
  else if (description.length > MAX_DESCRIPTION_LENGTH)
    errors.push(`description 超过 ${MAX_DESCRIPTION_LENGTH} 字符`)
  return errors
}

// 解析单个 SKILL.md → LoadedSkill；description 缺失/为空不加载（记诊断）。
const loadSkillFromFile = (filePath: string, diagnostics: string[]): LoadedSkill | null => {
  try {
    const raw = readFileSync(filePath, "utf8")
    const frontmatter = (matter(raw).data ?? {}) as Record<string, unknown>
    const description =
      typeof frontmatter.description === "string" ? frontmatter.description : undefined
    const name =
      typeof frontmatter.name === "string" && frontmatter.name.trim()
        ? frontmatter.name
        : basename(dirname(filePath))

    for (const error of [...validateDescription(description), ...validateName(name)]) {
      diagnostics.push(`[skill] ${filePath}: ${error}`)
    }
    if (!description || description.trim() === "") return null

    return {
      name,
      description,
      filePath,
      baseDir: dirname(filePath),
      disableModelInvocation: frontmatter["disable-model-invocation"] === true,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    diagnostics.push(`[skill] ${filePath}: 解析失败 - ${message}`)
    return null
  }
}

// 递归扫描目录：含 SKILL.md 即 skill 根（不再递归）；否则加载直接 .md 子文件并继续递归子目录。
const loadSkillsFromDirInternal = (
  dir: string,
  includeRootFiles: boolean,
  diagnostics: string[],
  matcher?: IgnoreMatcher,
  rootDir?: string,
): LoadedSkill[] => {
  const skills: LoadedSkill[] = []
  if (!existsSync(dir)) return skills

  const root = rootDir ?? dir
  const matcherInstance = matcher ?? ignore()
  addIgnoreRules(matcherInstance, dir, root)

  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return skills
  }

  // 第一遍：本目录直接含 SKILL.md → skill 根，加载后不再递归。
  for (const entry of entries) {
    if (entry.name !== "SKILL.md") continue
    const fullPath = join(dir, entry.name)
    let isFile = entry.isFile()
    if (entry.isSymbolicLink()) {
      try {
        isFile = statSync(fullPath).isFile()
      } catch {
        continue
      }
    }
    const relPath = toPosixPath(relative(root, fullPath))
    if (!isFile || matcherInstance.ignores(relPath)) continue
    const skill = loadSkillFromFile(fullPath, diagnostics)
    if (skill) skills.push(skill)
    return skills
  }

  // 第二遍：跳过 dot 条目与 node_modules；递归子目录；加载直接 .md 子文件。
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue
    const fullPath = join(dir, entry.name)
    let isDirectory = entry.isDirectory()
    let isFile = entry.isFile()
    if (entry.isSymbolicLink()) {
      try {
        const stats = statSync(fullPath)
        isDirectory = stats.isDirectory()
        isFile = stats.isFile()
      } catch {
        continue
      }
    }
    const relPath = toPosixPath(relative(root, fullPath))
    if (matcherInstance.ignores(isDirectory ? `${relPath}/` : relPath)) continue
    if (isDirectory) {
      skills.push(...loadSkillsFromDirInternal(fullPath, false, diagnostics, matcherInstance, root))
      continue
    }
    if (!isFile || !includeRootFiles || !entry.name.endsWith(".md")) continue
    const skill = loadSkillFromFile(fullPath, diagnostics)
    if (skill) skills.push(skill)
  }
  return skills
}

// 合并双来源：user（~/.lx/skills）优先，project（<cwd>/.lx/skills）同名冲突被覆盖（记诊断）。
const loadSkills = (cwd: string): LoadedSkill[] => {
  const diagnostics: string[] = []
  const skillMap = new Map<string, LoadedSkill>()

  const addFromDir = (dir: string): void => {
    for (const skill of loadSkillsFromDirInternal(dir, true, diagnostics)) {
      const existing = skillMap.get(skill.name)
      if (existing) {
        diagnostics.push(
          `[skill] 名称冲突 "${skill.name}"：${skill.filePath} 被 ${existing.filePath} 覆盖`,
        )
        continue
      }
      skillMap.set(skill.name, skill)
    }
  }

  addFromDir(join(getAppDataRoot(), "skills"))
  addFromDir(join(resolve(cwd), ".lx", "skills"))
  for (const message of diagnostics) console.warn(message)
  return [...skillMap.values()]
}

/**
 * 进程内单例；按会话 cwd 缓存 user + project 合并结果，cwd 变化时刷新。
 */
class SkillLoader {
  private cache = new Map<string, LoadedSkill[]>()

  load(cwd: string): LoadedSkill[] {
    const cached = this.cache.get(cwd)
    if (cached) return cached
    const skills = loadSkills(cwd)
    this.cache.set(cwd, skills)
    return skills
  }

  get(name: string, cwd: string): LoadedSkill | undefined {
    return this.load(cwd).find((skill) => skill.name === name)
  }

  // user 级 skills 目录（文档/诊断用）。
  getSkillDir(): string {
    return join(getAppDataRoot(), "skills")
  }
}

export const skillLoader = new SkillLoader()

// 去除 SKILL.md 的 YAML frontmatter，返回正文；无 frontmatter 原样返回。
export const stripFrontmatter = (content: string): string => {
  if (!content.startsWith("---")) return content
  const end = content.indexOf("\n---", 3)
  if (end === -1) return content
  return content.slice(end + 4).replace(/^\r?\n/, "")
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")

/**
 * 拼接 systemPrompt 的 skill 注入 XML 块（对齐 pi `formatSkillsForPrompt`）。
 * `disable-model-invocation` 的 skill 不进 prompt（仅显式可用）。
 */
export const formatSkillsForPrompt = (skills: LoadedSkill[]): string => {
  const visible = skills.filter((skill) => !skill.disableModelInvocation)
  if (visible.length === 0) return ""

  const lines = [
    "\n\nThe following skills provide specialized instructions for specific tasks.",
    "Use the read_skill tool to load a skill's file when the task matches its description.",
    "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md) and use that absolute path in tool commands.",
    "",
    "<available_skills>",
  ]
  for (const skill of visible) {
    lines.push("  <skill>")
    lines.push(`    <name>${escapeXml(skill.name)}</name>`)
    lines.push(
      `    <description>${escapeXml(skill.description.slice(0, MAX_DESCRIPTION_LENGTH))}</description>`,
    )
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`)
    lines.push("  </skill>")
  }
  lines.push("</available_skills>")
  return lines.join("\n")
}
