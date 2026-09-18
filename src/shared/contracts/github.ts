// 官方仓库全名（owner/repo）：更新检查与星标展示共用同一来源。
export const GITHUB_REPO = "yonah-lin111/lx-agent"
// 官方仓库页面地址。
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`

// GitHub 仓库星标查询结果：main 进程为唯一状态源，renderer 只读消费。
export interface GitHubStarsState {
  // 仓库星标数（尚未成功获取时为 null）。
  stars: number | null
  // 最近一次请求是否失败（失败时保留上一次成功值）。
  failed: boolean
  // 最近一次成功获取的时间（null 表示本次运行尚未成功获取）。
  fetchedAt: number | null
}

// GitHub 仓库元数据领域 preload API 契约。
export interface GitHubApi {
  github: {
    getStars: () => Promise<GitHubStarsState>
  }
}
