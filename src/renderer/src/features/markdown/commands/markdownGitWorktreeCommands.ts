import type { GitWorktreeEntry } from "@shared/contracts/git"

// git 工作区切换的选项构造与解析（纯函数，供二级面板与回车触发共用）。

// 从绝对路径提取目录名（渲染层无 node:path，用字符串拆分）。
export const getGitWorktreeDirName = (path: string): string => {
  const normalized = path.replace(/[\\/]+$/, "")
  return normalized.split(/[\\/]/).pop() ?? path
}

// 工作区显示名：分支名优先，detached 退化目录名。
export const getGitWorktreeDisplayName = (entry: { branch: string | null; path: string }): string =>
  entry.branch ?? getGitWorktreeDirName(entry.path)

// 二级面板选项。
export interface GitWorktreeOption {
  // 展示名：分支名优先，detached 用目录名；默认工作区用项目分支名。
  name: string
  // 工作区根目录绝对路径。
  path: string
  // 检出分支名；detached 为 null。
  branch: string | null
  // 是否默认工作区（项目路径）。
  isDefault: boolean
  // 是否为当前上下文绑定（全局绑定或模板块局部绑定命中时）。
  isCurrent: boolean
}

/**
 * 构造二级面板工作区选项：默认工作区（项目路径）置顶，随后为其余工作区。
 * 默认工作区展示名取项目分支名（projectBranch）。
 */
export const buildGitWorktreeOptions = ({
  worktrees,
  projectPath,
  projectBranch,
  worktreePath,
}: {
  worktrees: readonly GitWorktreeEntry[] | null
  projectPath: string
  projectBranch: string | null
  worktreePath?: string
}): GitWorktreeOption[] => {
  const defaultOption: GitWorktreeOption = {
    name: projectBranch ?? getGitWorktreeDirName(projectPath),
    path: projectPath,
    branch: projectBranch,
    isDefault: true,
    isCurrent: worktreePath === undefined || worktreePath === projectPath,
  }
  const others: GitWorktreeOption[] = (worktrees ?? [])
    .filter((entry) => entry.path !== projectPath)
    .map((entry) => ({
      name: getGitWorktreeDisplayName(entry),
      path: entry.path,
      branch: entry.branch,
      isDefault: false,
      isCurrent: entry.path === worktreePath,
    }))

  return [defaultOption, ...others]
}

// 解析结果：目标工作区路径 + 是否默认 + 是否 detached（无法局部绑定）。
export interface GitWorktreeTarget {
  path: string
  isDefault: boolean
  isDetached: boolean
}

/**
 * 将 md 回显值（分支名或 detached 目录名）解析为工作区目标。
 * 优先按分支名匹配，其次按目录名匹配；匹配不到返回 null。
 * 默认工作区（项目路径，含仓库子目录场景）按 projectBranch 识别。
 */
export const resolveGitWorktreeTarget = (
  value: string,
  worktrees: readonly GitWorktreeEntry[] | null,
  projectPath: string,
  projectBranch: string | null = null,
): GitWorktreeTarget | null => {
  const trimmed = value.trim()
  if (!trimmed) return null

  // 回显值命中项目当前分支 → 目标为默认工作区（项目路径）。
  if (projectBranch !== null && trimmed === projectBranch) {
    return { path: projectPath, isDefault: true, isDetached: false }
  }

  const match =
    (worktrees ?? []).find((entry) => entry.branch === trimmed) ??
    (worktrees ?? []).find((entry) => getGitWorktreeDirName(entry.path) === trimmed)
  if (!match) return null

  return {
    path: match.path,
    isDefault: match.path === projectPath,
    isDetached: match.branch === null,
  }
}
