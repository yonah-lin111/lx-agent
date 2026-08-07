#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { existsSync, lstatSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

// vite/electron-vite 运行期缓存目录，不作为“已安装依赖”的依据。
const CACHE_DIRS = new Set([".vite", ".vite-temp"])

/**
 * 判断 node_modules 是否可用：存在，且为链接或包含已安装的依赖。
 */
export const isUsableNodeModules = (dir) => {
  if (!existsSync(dir)) return false

  try {
    if (lstatSync(dir).isSymbolicLink()) return true
  } catch {
    return false
  }

  try {
    return readdirSync(dir).some((entry) => !CACHE_DIRS.has(entry))
  } catch {
    return false
  }
}

/**
 * 主仓库路径：`git worktree list` 的首个（主）工作区。
 */
export const getPrimaryRepoPath = () => {
  try {
    const list = execFileSync("git", ["worktree", "list", "--porcelain"], {
      encoding: "utf8",
    }).trim()
    const line = list.split("\n").find((entry) => entry.startsWith("worktree "))
    return line ? resolve(line.slice("worktree ".length)) : null
  } catch {
    return null
  }
}

/**
 * 提取 package.json 中影响依赖树的字段，脚本/名称等变化不影响复用。
 */
const getDependencyManifest = (file) => {
  const pkg = JSON.parse(readFileSync(file, "utf8"))
  const keys = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
  return JSON.stringify(Object.fromEntries(keys.map((key) => [key, pkg[key] ?? {}])))
}

/**
 * 确保当前目录（Git worktree）的 node_modules 可用。
 *
 * - 主仓库的安装可复用时，将工作区 node_modules 链接到主仓库，避免重复安装与
 *   native 模块（better-sqlite3）重复编译；
 * - 仅当工作区与主仓库的依赖声明与锁文件完全一致时才复用；
 * - 返回 { ok: true } 表示已就绪（可能新建了链接），否则返回错误信息。
 */
export const ensureWorktreeNodeModules = () => {
  const cwd = resolve(".")
  const ownNodeModules = join(cwd, "node_modules")

  if (isUsableNodeModules(ownNodeModules)) {
    return { ok: true }
  }

  const primaryRepo = getPrimaryRepoPath()
  if (!primaryRepo || resolve(primaryRepo) === cwd) {
    return {
      ok: false,
      message: "当前目录的 node_modules 不可用，请先执行 pnpm install 后再启动。",
    }
  }

  const primaryNodeModules = join(primaryRepo, "node_modules")
  if (!isUsableNodeModules(primaryNodeModules)) {
    return {
      ok: false,
      message: `主仓库（${primaryRepo}）的 node_modules 不可用，请先在主仓库执行 pnpm install。`,
    }
  }

  // 依赖集一致性：依赖字段与锁文件一致才可安全复用主仓库的安装。
  const ownManifest = getDependencyManifest(join(cwd, "package.json"))
  const primaryManifest = getDependencyManifest(join(primaryRepo, "package.json"))
  const ownLock = readFileSync(join(cwd, "pnpm-lock.yaml"), "utf8")
  const primaryLock = readFileSync(join(primaryRepo, "pnpm-lock.yaml"), "utf8")
  if (ownManifest !== primaryManifest || ownLock !== primaryLock) {
    return {
      ok: false,
      message: "工作区与主仓库的依赖声明或锁文件不一致，请在工作区执行 pnpm install 独立安装依赖。",
    }
  }

  if (existsSync(ownNodeModules)) {
    rmSync(ownNodeModules, { recursive: true, force: true })
  }
  symlinkSync(primaryNodeModules, ownNodeModules, "junction")

  return {
    ok: true,
    message: `已链接 node_modules -> ${primaryNodeModules}\n提示：如需在工作区独立安装依赖，请先删除 node_modules 链接再执行 pnpm install。`,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = ensureWorktreeNodeModules()
  if (result.ok) {
    if (result.message) console.log(result.message)
  } else {
    console.error(result.message)
    process.exit(1)
  }
}
