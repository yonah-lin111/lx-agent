import type { GitHubStarsState } from "@shared/contracts/github"

// 状态尚未就绪时的占位结果（preload API 缺失，例如测试环境）。
export const EMPTY_GITHUB_STARS_STATE: GitHubStarsState = {
  stars: null,
  failed: false,
  fetchedAt: null,
}

/**
 * 隔离 GitHub 仓库元数据对 Electron preload API 的直接依赖。
 */
export const githubApi = {
  getStars: (): Promise<GitHubStarsState> =>
    window?.api?.github?.getStars?.() ?? Promise.resolve(EMPTY_GITHUB_STARS_STATE),
}
