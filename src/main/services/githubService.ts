import { GITHUB_REPO, type GitHubStarsInfo } from "@shared/contracts/github"

// 仓库元数据查询接口。
const REPO_API_URL = `https://api.github.com/repos/${GITHUB_REPO}`
// 星数缓存有效期：成功获取后命中缓存不再发起请求。
const CACHE_TTL_MS = 30 * 60 * 1000
// 单次请求超时。
const REQUEST_TIMEOUT_MS = 5000

// 查询仓库星数；非 2xx、字段缺失或异常统一返回 null。
const lookupStars = async (): Promise<number | null> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(REPO_API_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "lx-agent" },
      signal: controller.signal,
    })
    if (!response.ok) return null

    const payload = (await response.json()) as { stargazers_count?: unknown }
    const stars = payload.stargazers_count
    return typeof stars === "number" && Number.isFinite(stars) ? stars : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * GitHub 仓库元数据服务：查询星标数并在主进程内缓存 30 分钟。
 * 仅成功结果写入缓存窗口；失败保留上一次成功值，下次调用重新尝试。
 */
export class GitHubService {
  private stars: number | null = null
  // 最近一次成功获取的时间，用于缓存判定（失败不更新）。
  private lastSuccessAt: number | null = null
  private inflight: Promise<GitHubStarsInfo> | null = null

  // 当前状态（不触发网络请求）。
  getState(): GitHubStarsInfo {
    return { stars: this.stars }
  }

  // 获取星数；缓存有效期内直接返回，同一时刻的并发调用共享同一次请求。
  async getStars(): Promise<GitHubStarsInfo> {
    const cacheFresh = this.lastSuccessAt !== null && Date.now() - this.lastSuccessAt < CACHE_TTL_MS
    if (cacheFresh) return this.getState()
    if (this.inflight) return this.inflight

    this.inflight = this.runFetch().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  private async runFetch(): Promise<GitHubStarsInfo> {
    const result = await lookupStars()
    if (result !== null) {
      this.stars = result
      this.lastSuccessAt = Date.now()
    }
    return this.getState()
  }
}

export const githubService = new GitHubService()
