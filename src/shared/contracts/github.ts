// 官方仓库全名（owner/repo）：更新检查与仓库入口链接共用同一来源。
export const GITHUB_REPO = "yonah-lin111/lx-agent"
// 官方仓库页面地址。
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`

// GitHub 仓库星标查询结果：main 进程为唯一状态源，renderer 只读消费。
export interface GitHubStarsInfo {
  // 仓库星标数（尚未成功获取或本次请求失败时为 null）。
  stars: number | null
}

// GitHub 仓库元数据领域 preload API 契约。
export interface GitHubApi {
  github: {
    getStars: () => Promise<GitHubStarsInfo>
  }
}
