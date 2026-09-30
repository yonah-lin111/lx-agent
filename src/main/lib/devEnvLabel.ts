import { execFileSync } from "node:child_process"
import { basename, resolve } from "node:path"

// 显示用产品名（与 index.html <title>、electron-builder productName 对齐）。
export const APP_DISPLAY_NAME = "LX Agent"

// 追加环境标签时的分隔符。
const LABEL_SEPARATOR = " · "

// git 探测单条命令超时（ms）；超时按无标签降级。
const GIT_TIMEOUT_MS = 2000

// git 环境探测结果（纯数据，便于拼接规则单测）。
export interface DevEnvInfo {
  // `git rev-parse --abbrev-ref HEAD` 输出；detached HEAD 时为 "HEAD"。
  branch: string
  // detached HEAD 时的短 SHA。
  detachedSha?: string
  // 工作区目录名（`git rev-parse --show-toplevel` 的 basename）。
  worktreeName: string
  // 是否为 `git worktree add` 创建的链接工作区（主仓库为 false）。
  isLinkedWorktree: boolean
}

/**
 * 生成开发态环境标签（纯函数）：
 * - 链接工作区且分支名不含工作区名尾段 → `<分支>-<工作区>`；
 * - 主仓库 / 工作区名与分支尾段重复 / detached HEAD → 仅分支名或短 SHA；
 * - 无有效信息 → null（不追加后缀）。
 */
export const formatDevEnvLabel = (info: DevEnvInfo): string | null => {
  const branch = info.branch.trim()
  if (branch === "" || branch === "HEAD") {
    return info.detachedSha?.trim() || null
  }
  const worktreeName = info.worktreeName.trim()
  if (!info.isLinkedWorktree || worktreeName === "") return branch
  if (branch === worktreeName || branch.endsWith(`/${worktreeName}`)) return branch
  return `${branch}-${worktreeName}`
}

/**
 * 组合窗口标题：有环境标签时在页面标题后追加 ` · <标签>`；无标签原样返回。
 */
export const composeWindowTitle = (pageTitle: string, envLabel: string | null): string => {
  if (!envLabel) return pageTitle
  const base = pageTitle.trim() || APP_DISPLAY_NAME
  return `${base}${LABEL_SEPARATOR}${envLabel}`
}

// 同步执行 git 子命令并裁剪输出；失败/超时抛出，由调用方降级。
const runGit = (cwd: string, args: string[]): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  }).trim()

/**
 * 探测 cwd 所属 git 环境并生成开发标签；非 git 目录 / 无 git / 超时等任何失败返回 null。
 */
export const resolveDevEnvLabel = (cwd: string): string | null => {
  try {
    const branch = runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])
    const detachedSha =
      branch === "HEAD" ? runGit(cwd, ["rev-parse", "--short", "HEAD"]) : undefined
    const [toplevel = "", gitDir = "", gitCommonDir = ""] = runGit(cwd, [
      "rev-parse",
      "--show-toplevel",
      "--git-dir",
      "--git-common-dir",
    ]).split("\n")
    if (!toplevel) return null
    return formatDevEnvLabel({
      branch,
      ...(detachedSha ? { detachedSha } : {}),
      worktreeName: basename(toplevel),
      isLinkedWorktree: resolve(cwd, gitDir) !== resolve(cwd, gitCommonDir),
    })
  } catch {
    return null
  }
}
