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

// Git 领域 preload API。
export interface GitApi {
  git: {
    // 查询指定目录的 git 分支与工作区变更；目录非 git 仓库时返回 null（能力降级）。
    getStatus: (directory: string) => Promise<GitStatus | null>
  }
}
