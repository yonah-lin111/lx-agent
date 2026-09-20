import type { GitHubStarsInfo } from "@shared/contracts/github"

// 状态尚未就绪时的占位结果（preload API 缺失，例如测试环境）。
const EMPTY_STARS_INFO: GitHubStarsInfo = { stars: null }

/**
 * 隔离 GitHub 仓库元数据对 Electron preload API 的直接依赖。
 */
export const githubApi = {
  getStars: (): Promise<GitHubStarsInfo> =>
    window?.api?.github?.getStars?.() ?? Promise.resolve(EMPTY_STARS_INFO),
}
