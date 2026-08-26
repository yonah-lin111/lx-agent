// Git 领域 preload API 契约：工作区只读状态查询。

// 工作区变更计数（按 git status --porcelain 首列 X/Y 状态码解析）。
export interface GitWorktreeChanges {
  // 已暂存（staged）变更数：X 列为 A/M/D/R/C。
  staged: number
  // 未暂存（unstaged）变更数：Y 列为 M/D（已跟踪文件的工作区改动）。
  unstaged: number
  // 未跟踪（untracked）文件数：?? 条目。
  untracked: number
}

// git 工作区状态。
export interface GitStatus {
  branch: string
  changes: GitWorktreeChanges
}

// git 工作区列表条目（git worktree list --porcelain 解析）。
export interface GitWorktreeEntry {
  // 工作区根目录绝对路径。
  path: string
  // 当前检出分支名；detached HEAD 时为 null。
  branch: string | null
  // 是否为主工作区（仓库根目录，即「默认工作区」）。
  isDefault: boolean
}

// git 分支检出结果。
export interface GitCheckoutBranchResult {
  ok: boolean
  error?: string
}

// Git 领域 preload API。
export interface GitApi {
  git: {
    // 查询指定目录的 git 分支与工作区变更；目录非 git 仓库时返回 null（能力降级）。
    getStatus: (directory: string) => Promise<GitStatus | null>
    // 列出指定目录所在仓库的全部工作区；非 git 仓库返回 null。
    listWorktrees: (directory: string) => Promise<GitWorktreeEntry[] | null>
    // 列出指定目录所在仓库的本地分支列表；非 git 仓库返回 null。
    listBranches: (directory: string) => Promise<string[] | null>
    // 在指定目录检出分支；成功返回 { ok: true }，失败返回 { ok: false, error: string }。
    checkoutBranch: (directory: string, branch: string) => Promise<GitCheckoutBranchResult>
  }
}
