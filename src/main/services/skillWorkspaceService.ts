import {
  chmodSync,
  copyFileSync,
  type Dirent,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import type {
  ImportSkillFilesResult,
  SaveSkillInput,
  SaveSkillResult,
  SkillFileContent,
  SkillFileEntry,
  SkillFileOpResult,
  SkillScope,
  SkillTargetRoot,
} from "@shared/contracts/agent"
import {
  validateSkillName,
  validateSkillPathSegment,
  validateSkillRelativePath,
} from "@shared/skillPaths"
import { shell } from "electron"
import matter from "gray-matter"
import { skillLoader } from "@/agent/skills/skillLoader"
import { getAppDataRoot, getStandardSkillsDir } from "@/paths"

// 单个文本文件读取上限（超出拒绝，避免把大文件塞进编辑器）。
const MAX_TEXT_FILE_BYTES = 512 * 1024
// 文件树扫描上限：最大条目数与最大深度。
const MAX_TREE_ENTRIES = 500
const MAX_TREE_DEPTH = 4
// POSIX 下需要补可执行位的脚本后缀。
const EXECUTABLE_EXTENSIONS = new Set([".sh", ".bash", ".py"])

// 向上查找路径所属的 skills 根目录（.lx/skills 或 .agents/skills）；未命中返回 null。
export const findSkillsRoot = (targetPath: string): string | null => {
  let current = resolve(targetPath)
  while (true) {
    const name = basename(current)
    if (name === "skills") {
      const owner = basename(dirname(current))
      if (owner === ".lx" || owner === ".agents") return current
    }
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

// 判断路径是否位于根目录之下（不含根本身）。
const isInsideDir = (target: string, root: string): boolean => {
  const rel = relative(root, target)
  return Boolean(rel) && !rel.startsWith("..") && !isAbsolute(rel)
}

// 判断目录是否可作为 Skill 工作区（受支持根目录之下的目录，且不是根目录本身）。
export const isSkillWorkspaceDir = (dir: string): boolean => {
  const resolved = resolve(dir)
  if (!existsSync(resolved)) return false
  try {
    if (!statSync(resolved).isDirectory()) return false
  } catch {
    return false
  }
  const userRoots = [join(getAppDataRoot(), "skills"), getStandardSkillsDir()]
  for (const root of userRoots) {
    if (isInsideDir(resolved, resolve(root))) return true
  }
  const root = findSkillsRoot(resolved)
  return root !== null && root !== resolved
}

// 解析可写 Skill 根目录（scope + targetRoot + projectPath）。
export const resolveSkillRoot = (
  scope: SkillScope,
  targetRoot: SkillTargetRoot,
  projectPath?: string,
): { root: string } | { error: string } => {
  if (scope === "user") {
    return {
      root: targetRoot === "agents" ? getStandardSkillsDir() : join(getAppDataRoot(), "skills"),
    }
  }
  if (!projectPath?.trim()) return { error: "Project path is required for project skills." }
  const projectDir = resolve(projectPath.trim())
  if (!existsSync(projectDir)) return { error: "Project path does not exist." }
  try {
    if (!statSync(projectDir).isDirectory()) return { error: "Project path is not a directory." }
  } catch {
    return { error: "Project path is not accessible." }
  }
  return {
    root:
      targetRoot === "agents"
        ? join(projectDir, ".agents", "skills")
        : join(projectDir, ".lx", "skills"),
  }
}

// 解析并校验 skill 目录内的目标路径（保证目标仍在 skill 目录内）。
const resolveInsideSkillDir = (
  skillDir: string,
  relativePath: string,
  options: { allowManifest?: boolean } = {},
): { target: string; baseDir: string } | { error: string } => {
  const pathError = validateSkillRelativePath(relativePath)
  if (pathError) return { error: pathError }
  const baseDir = resolve(skillDir)
  if (!isSkillWorkspaceDir(baseDir)) return { error: "Not a writable skill directory." }
  const target = resolve(baseDir, ...relativePath.trim().split(/[\\/]/))
  const rel = relative(baseDir, target)
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    return { error: "Path escapes the skill directory." }
  }
  // SKILL.md 的写操作走 saveSkill（frontmatter 合并）；读取不受限制。
  if (!options.allowManifest && rel.split(sep).join("/").toLowerCase() === "skill.md") {
    return { error: "SKILL.md is managed by the skill editor." }
  }
  return { target, baseDir }
}

// 路径转 posix 分隔符（IPC 统一格式）。
const toPosixPath = (value: string): string => value.split(sep).join("/")

// 列出 Skill 目录内的文件树（跳过隐藏项、node_modules 与符号链接）。
export const listSkillFiles = (skillDir: string): SkillFileEntry[] => {
  const baseDir = resolve(skillDir)
  if (!isSkillWorkspaceDir(baseDir)) throw new Error("Not a readable skill directory.")

  const entries: SkillFileEntry[] = []
  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_TREE_DEPTH || entries.length >= MAX_TREE_ENTRIES) return
    let items: Dirent[]
    try {
      items = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    items.sort((a, b) => a.name.localeCompare(b.name))
    for (const item of items) {
      if (entries.length >= MAX_TREE_ENTRIES) return
      if (item.name.startsWith(".") || item.name === "node_modules") continue
      if (item.isSymbolicLink()) continue
      const fullPath = join(dir, item.name)
      const relativePath = toPosixPath(relative(baseDir, fullPath))
      if (item.isDirectory()) {
        entries.push({ relativePath, name: item.name, kind: "directory", sizeBytes: 0 })
        walk(fullPath, depth + 1)
        continue
      }
      if (!item.isFile()) continue
      let sizeBytes = 0
      try {
        sizeBytes = statSync(fullPath).size
      } catch {
        sizeBytes = 0
      }
      entries.push({ relativePath, name: item.name, kind: "file", sizeBytes })
    }
  }

  walk(baseDir, 0)
  return entries
}

// 读取 Skill 目录内的文本文件（拒绝二进制与超限文件）。
export const readSkillFile = (skillDir: string, relativePath: string): SkillFileContent => {
  const resolved = resolveInsideSkillDir(skillDir, relativePath, { allowManifest: true })
  if ("error" in resolved) return { ok: false, error: resolved.error }
  if (!existsSync(resolved.target)) return { ok: false, error: "File does not exist." }

  let stats: ReturnType<typeof statSync>
  try {
    stats = statSync(resolved.target)
  } catch {
    return { ok: false, error: "File is not accessible." }
  }
  if (!stats.isFile()) return { ok: false, error: "Not a file." }
  if (stats.size > MAX_TEXT_FILE_BYTES) {
    return { ok: false, error: "File is too large to edit." }
  }

  const buffer = readFileSync(resolved.target)
  if (buffer.includes(0)) return { ok: false, error: "Binary files cannot be edited." }
  return { ok: true, content: buffer.toString("utf8") }
}

// 写入 Skill 目录内的文本文件（自动创建父目录；POSIX 下脚本补可执行位）。
export const writeSkillFile = (
  skillDir: string,
  relativePath: string,
  content: string,
): SkillFileOpResult => {
  if (typeof content !== "string") return { ok: false, error: "File content must be a string." }
  const resolved = resolveInsideSkillDir(skillDir, relativePath)
  if ("error" in resolved) return { ok: false, error: resolved.error }

  try {
    mkdirSync(dirname(resolved.target), { recursive: true })
    writeFileSync(resolved.target, content.replace(/\r\n/g, "\n"), "utf8")
    const dotIndex = relativePath.lastIndexOf(".")
    const extension = dotIndex >= 0 ? relativePath.slice(dotIndex).toLowerCase() : ""
    if (process.platform !== "win32" && EXECUTABLE_EXTENSIONS.has(extension)) {
      try {
        chmodSync(resolved.target, 0o755)
      } catch {
        // 平台不支持时忽略。
      }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// 删除 Skill 目录内的文件/目录（移入系统回收站）。
export const deleteSkillFile = async (
  skillDir: string,
  relativePath: string,
): Promise<SkillFileOpResult> => {
  const resolved = resolveInsideSkillDir(skillDir, relativePath)
  if ("error" in resolved) return { ok: false, error: resolved.error }
  if (!existsSync(resolved.target)) return { ok: false, error: "File does not exist." }

  try {
    await shell.trashItem(resolved.target)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// 移动/重命名 Skill 目录内的文件与目录。
export const moveSkillFile = (
  skillDir: string,
  fromRelativePath: string,
  toRelativePath: string,
): SkillFileOpResult => {
  const source = resolveInsideSkillDir(skillDir, fromRelativePath)
  if ("error" in source) return { ok: false, error: source.error }
  const destination = resolveInsideSkillDir(skillDir, toRelativePath)
  if ("error" in destination) return { ok: false, error: destination.error }
  if (!existsSync(source.target)) return { ok: false, error: "Source does not exist." }
  if (existsSync(destination.target)) return { ok: false, error: "Target already exists." }

  try {
    mkdirSync(dirname(destination.target), { recursive: true })
    renameSync(source.target, destination.target)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// 复制外部文件进 Skill 目录（重名时追加数字后缀，不覆盖）。
export const importSkillFiles = (
  skillDir: string,
  targetDirRelativePath: string,
  sourcePaths: string[],
): ImportSkillFilesResult => {
  const baseDir = resolve(skillDir)
  if (!isSkillWorkspaceDir(baseDir)) return { ok: false, error: "Not a writable skill directory." }
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
    return { ok: false, error: "No source files selected." }
  }

  const trimmedTarget = targetDirRelativePath.trim()
  let targetDir = baseDir
  if (trimmedTarget) {
    const pathError = validateSkillRelativePath(trimmedTarget)
    if (pathError) return { ok: false, error: pathError }
    targetDir = resolve(baseDir, ...trimmedTarget.split(/[\\/]/))
    const rel = relative(baseDir, targetDir)
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
      return { ok: false, error: "Path escapes the skill directory." }
    }
    try {
      if (existsSync(targetDir) && !statSync(targetDir).isDirectory()) {
        return { ok: false, error: "Target path is not a directory." }
      }
    } catch {
      return { ok: false, error: "Target path is not accessible." }
    }
  }

  try {
    mkdirSync(targetDir, { recursive: true })
    const copied: string[] = []
    for (const sourcePath of sourcePaths) {
      const source = resolve(sourcePath)
      if (!existsSync(source))
        return { ok: false, error: `Source file does not exist: ${sourcePath}` }
      const stats = statSync(source)
      if (!stats.isFile()) return { ok: false, error: `Source is not a file: ${sourcePath}` }
      const sourceName = basename(source)
      const segmentError = validateSkillPathSegment(sourceName)
      if (segmentError) return { ok: false, error: segmentError }

      const dotIndex = sourceName.lastIndexOf(".")
      const stem = dotIndex > 0 ? sourceName.slice(0, dotIndex) : sourceName
      const extension = dotIndex > 0 ? sourceName.slice(dotIndex) : ""
      let fileName = sourceName
      let attempt = 1
      while (existsSync(join(targetDir, fileName))) {
        fileName = `${stem}-${attempt}${extension}`
        attempt += 1
      }

      copyFileSync(source, join(targetDir, fileName))
      copied.push(toPosixPath(relative(baseDir, join(targetDir, fileName))))
    }
    return { ok: true, files: copied }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// 判断是否为普通对象（frontmatter 合并用）。
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// 新建或更新 Skill：写回 SKILL.md（frontmatter 合并保留未知键），改名即重命名目录。
export const saveSkill = (input: SaveSkillInput): SaveSkillResult => {
  const name = input.name.trim()
  const nameError = validateSkillName(name)
  if (nameError) return { ok: false, error: nameError }
  const description = input.description.trim()
  if (!description) return { ok: false, error: "Skill description is required." }

  // 定位原有 Skill 目录：优先显式 originalDir；否则解析 scope 根目录并按原名查找。
  let originalDir: string | null = null
  let skillsRoot: string | null = null
  if (input.originalDir?.trim()) {
    const candidate = resolve(input.originalDir.trim())
    if (!isSkillWorkspaceDir(candidate)) {
      return { ok: false, error: "Original skill directory is not writable." }
    }
    originalDir = candidate
  } else {
    const rootResult = resolveSkillRoot(input.scope, input.targetRoot, input.projectPath)
    if ("error" in rootResult) return { ok: false, error: rootResult.error }
    skillsRoot = rootResult.root
    if (input.originalName?.trim()) {
      const candidate = join(skillsRoot, input.originalName.trim())
      if (existsSync(candidate)) originalDir = candidate
    }
  }

  const targetDir = originalDir
    ? join(dirname(originalDir), name)
    : join(skillsRoot ?? join(getAppDataRoot(), "skills"), name)
  try {
    if (!originalDir && skillsRoot) mkdirSync(skillsRoot, { recursive: true })
    if (originalDir && originalDir !== targetDir && existsSync(originalDir)) {
      if (existsSync(targetDir)) return { ok: false, error: `Skill "${name}" already exists.` }
      renameSync(originalDir, targetDir)
    }
    mkdirSync(targetDir, { recursive: true })

    const filePath = join(targetDir, "SKILL.md")
    const existingContent = existsSync(filePath) ? readFileSync(filePath, "utf8") : null
    const parsed = existingContent ? matter(existingContent) : null
    const data: Record<string, unknown> = parsed ? { ...parsed.data } : {}

    // 仅覆盖表单管理的五个键，其余未知键原样保留。
    data.name = name
    data.description = description
    if (input.displayName?.trim()) {
      data["display-name"] = input.displayName.trim()
    } else {
      delete data["display-name"]
    }
    const metadata = isRecord(data.metadata) ? { ...data.metadata } : {}
    if (input.shortDescription?.trim()) {
      metadata["short-description"] = input.shortDescription.trim()
    } else {
      delete metadata["short-description"]
    }
    if (Object.keys(metadata).length > 0) {
      data.metadata = metadata
    } else {
      delete data.metadata
    }
    if (input.disableModelInvocation) {
      data["disable-model-invocation"] = true
    } else {
      delete data["disable-model-invocation"]
    }

    // 正文缺省时保留既有正文（新建时为空）。
    const body =
      input.content === undefined
        ? (parsed?.content ?? "").replace(/\r\n/g, "\n").trimEnd()
        : input.content.replace(/\r\n/g, "\n").trimEnd()
    writeFileSync(filePath, matter.stringify(body ? `${body}\n` : "", data), "utf8")
    skillLoader.clearCache()
    return { ok: true, filePath, baseDir: targetDir }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// 判断路径是否位于可删除的 Skill 根目录之下（用户级根目录或 .lx/.agents 形态目录）。
const isDeletableSkillTarget = (target: string): boolean => {
  const resolvedTarget = resolve(target)
  const userRoots = [join(getAppDataRoot(), "skills"), getStandardSkillsDir()]
  for (const root of userRoots) {
    if (isInsideDir(resolvedTarget, resolve(root))) return true
  }
  const skillsRoot = findSkillsRoot(resolvedTarget)
  return skillsRoot !== null && resolvedTarget !== skillsRoot
}

// 安全删除 Skill（目录或单文件，移入系统回收站；仅限受支持根目录之下）。
export const deleteSkillSafe = async (
  filePath: string,
): Promise<{ success: boolean; error?: string }> => {
  const resolved = resolve(filePath)
  if (!existsSync(resolved)) return { success: false, error: "Skill path does not exist." }

  let stats: ReturnType<typeof statSync>
  try {
    stats = statSync(resolved)
  } catch {
    return { success: false, error: "Skill path is not accessible." }
  }

  // SKILL.md 删除其所属目录；显式目录需含 SKILL.md；其余仅允许 .md 单文件。
  let target = resolved
  if (stats.isFile()) {
    const fileName = basename(resolved)
    if (fileName === "SKILL.md") {
      target = dirname(resolved)
    } else if (!fileName.endsWith(".md")) {
      return { success: false, error: "Only skill files ending with .md can be deleted." }
    }
  } else if (stats.isDirectory()) {
    if (!existsSync(join(resolved, "SKILL.md"))) {
      return { success: false, error: "Directory is not a skill folder." }
    }
  } else {
    return { success: false, error: "Unsupported skill path." }
  }

  if (!isDeletableSkillTarget(target)) {
    return {
      success: false,
      error: "Only skills under .lx/skills or .agents/skills can be deleted.",
    }
  }

  try {
    await shell.trashItem(target)
    skillLoader.clearCache()
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
