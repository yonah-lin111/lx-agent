import { readFileSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import type { Ignore } from "ignore"
import ignore from "ignore"

// 默认跳过的高噪目录。
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
])

// 读取目录下的 .gitignore 规则；不存在或读取失败时返回 null。
const readGitignore = (directory: string): Ignore | null => {
  try {
    const rules = ignore()
    rules.add(readFileSync(join(directory, ".gitignore"), "utf8"))
    return rules
  } catch {
    return null
  }
}

export interface WalkOptions {
  signal?: AbortSignal
  /** 收集到该数量文件后提前停止 */
  maxResults?: number
}

// 递归收集 root 下所有文件相对路径（posix 分隔），跳过 .gitignore 与默认高噪目录。
export const walkFiles = async (root: string, options: WalkOptions = {}): Promise<string[]> => {
  const results: string[] = []
  const gitignoreStack: Array<{ directory: string; rules: Ignore }> = []

  const isGitignored = (fullPath: string, isDirectory: boolean): boolean => {
    for (let index = gitignoreStack.length - 1; index >= 0; index--) {
      const level = gitignoreStack[index]
      if (!level) continue
      const relativePath = relative(level.directory, fullPath)
      if (!relativePath || relativePath.startsWith(`..${sep}`)) continue
      const result = level.rules.test(relativePath.split(sep).join("/") + (isDirectory ? "/" : ""))
      if (result.unignored) return false
      if (result.ignored) return true
    }
    return false
  }

  const walk = async (directory: string): Promise<void> => {
    if (options.signal?.aborted) return
    if (options.maxResults !== undefined && results.length >= options.maxResults) return
    const rules = readGitignore(directory)
    if (rules) gitignoreStack.push({ directory, rules })

    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (options.signal?.aborted) return
      if (options.maxResults !== undefined && results.length >= options.maxResults) return
      if (entry.isSymbolicLink()) continue
      if (!entry.isDirectory() && !entry.isFile()) continue
      if (
        entry.isDirectory() &&
        (entry.name.startsWith(".") || IGNORED_DIRECTORIES.has(entry.name))
      ) {
        continue
      }

      const fullPath = join(directory, entry.name)
      const relativePath = relative(root, fullPath)
      if (!relativePath || relativePath.startsWith(`..${sep}`)) continue

      const isDirectory = entry.isDirectory()
      if (isGitignored(fullPath, isDirectory)) continue

      if (isDirectory) {
        await walk(fullPath)
      } else {
        results.push(relativePath.split(sep).join("/"))
      }
    }

    if (rules) gitignoreStack.pop()
  }

  await walk(root)
  return results
}

// 将 glob 模式编译为正则（支持 ** / * / ? / 字符类；不含 {} 展开）。
export const globToRegExp = (pattern: string): RegExp => {
  let source = "^"
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        // **：匹配任意层级；**/ 额外匹配零层目录
        if (pattern[index + 2] === "/") {
          source += "(?:.*/)?"
          index += 2
        } else {
          source += ".*"
          index += 1
        }
      } else {
        source += "[^/]*"
      }
    } else if (char === "?") {
      source += "[^/]"
    } else if (char === "[") {
      // 字符类原样透传（含反义 [^...]）
      const closeIndex = pattern.indexOf("]", index + 1)
      if (closeIndex === -1) {
        source += "\\["
      } else {
        source += pattern.slice(index, closeIndex + 1)
        index = closeIndex
      }
    } else {
      source += char.replace(/[.+^${}()|\\]/g, "\\$&")
    }
  }
  source += "$"
  return new RegExp(source)
}

// 读取文件内容为文本；失败返回空串。
export const readFileText = async (filePath: string): Promise<string> => {
  try {
    return await readFile(filePath, "utf-8")
  } catch {
    return ""
  }
}
