import { existsSync, readdirSync, realpathSync, statSync } from "node:fs"
import { basename, join, relative, sep } from "node:path"
import type { ProjectFileEntry } from "@shared/project"

// 不参与项目文件提及的目录。
const IGNORED_PROJECT_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
])

/**
 * 验证项目路径存在且指向目录。
 */
export const assertProjectDirectory = (path?: string): void => {
  if (!path?.trim()) return

  const normalizedPath = path.trim()
  if (!existsSync(normalizedPath) || !statSync(normalizedPath).isDirectory()) {
    throw new Error("PROJECT_PATH_NOT_FOUND")
  }
}

/**
 * 使用文件名优先的模糊规则计算项目文件匹配分值。
 */
export const getProjectFileMatchScore = (path: string, query: string): number => {
  if (!query) return 1

  const normalizedPath = path.toLowerCase()
  const fileName = basename(path)
  const normalizedFileName = fileName.toLowerCase()

  if (normalizedFileName === query) return 5000
  if (normalizedPath === query) return 4000
  if (normalizedFileName.startsWith(query)) return 3000
  if (normalizedPath.startsWith(query)) return 2000

  const fileNameCaps = fileName.replace(/[^A-Z]/g, "").toLowerCase()
  if (fileNameCaps && fileNameCaps.startsWith(query)) {
    return 2800 + (query.length === fileNameCaps.length ? 100 : 0)
  }
  if (fileNameCaps && fileNameCaps.includes(query)) return 2500
  if (normalizedFileName.includes(query)) return 1800

  let fileQueryIndex = 0
  let fileFirstMatchIndex = -1
  let fileLastMatchIndex = -1
  for (let index = 0; index < normalizedFileName.length; index++) {
    if (normalizedFileName[index] === query[fileQueryIndex]) {
      if (fileQueryIndex === 0) fileFirstMatchIndex = index
      fileQueryIndex += 1
      if (fileQueryIndex === query.length) {
        fileLastMatchIndex = index
        break
      }
    }
  }
  if (fileQueryIndex === query.length) {
    const span = fileLastMatchIndex - fileFirstMatchIndex + 1
    return Math.max(1200, 1500 - span * 10)
  }

  if (normalizedPath.includes(query)) return 800

  let pathQueryIndex = 0
  let pathFirstMatchIndex = -1
  let pathLastMatchIndex = -1
  for (let index = 0; index < normalizedPath.length; index++) {
    if (normalizedPath[index] === query[pathQueryIndex]) {
      if (pathQueryIndex === 0) pathFirstMatchIndex = index
      pathQueryIndex += 1
      if (pathQueryIndex === query.length) {
        pathLastMatchIndex = index
        break
      }
    }
  }
  if (pathQueryIndex === query.length) {
    const span = pathLastMatchIndex - pathFirstMatchIndex + 1
    return Math.max(100, 500 - span)
  }

  return 0
}

/**
 * 在给定项目根目录内搜索文件和目录。
 */
export const searchProjectFiles = (projectPath: string, query: string): ProjectFileEntry[] => {
  assertProjectDirectory(projectPath)

  const rootPath = realpathSync(projectPath)
  const cleanQuery = query.toLowerCase().replace(/^@/, "").trim()
  const matches: Array<ProjectFileEntry & { score: number }> = []

  const walk = (directory: string): void => {
    let entries
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      if (!entry.isDirectory() && !entry.isFile()) continue
      if (
        entry.isDirectory() &&
        (entry.name.startsWith(".") || IGNORED_PROJECT_DIRECTORIES.has(entry.name))
      ) {
        continue
      }

      const fullPath = join(directory, entry.name)
      const relativePath = relative(rootPath, fullPath)
      if (!relativePath || relativePath.startsWith(`..${sep}`)) continue

      const path = relativePath.split(sep).join("/")
      const isDirectory = entry.isDirectory()
      const score = getProjectFileMatchScore(path, cleanQuery)
      if (score > 0) matches.push({ path: isDirectory ? `${path}/` : path, isDirectory, score })
      if (isDirectory) walk(fullPath)
    }
  }

  walk(rootPath)

  return matches
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, 100)
    .map(({ path, isDirectory }) => ({ path, isDirectory }))
}
