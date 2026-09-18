import { GITHUB_REPO, type GitHubStarsState } from "@shared/contracts/github"

// 仓库元数据查询接口。
const REPO_API_URL = `https://api.github.com/repos/${GITHUB_REPO}`
// 星数缓存有效期：命中缓存不发请求。
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
 * 请求失败时保留上一次成功值并标记 failed；失败同样计入缓存窗口，避免限流下反复重试。
 */
export class GitHubService {
  private stars: number | null = null
  private fetchedAt: number | null = null
  private failed = false
  // 最近一次真实发起请求的时间，用于缓存判定。
  private lastAttemptAt: number | null = null
  private inflight: Promise<GitHubStarsState> | null = null

  // 当前状态（不触发网络请求）。
  getState(): GitHubStarsState {
    return { stars: this.stars, failed: this.failed, fetchedAt: this.fetchedAt }
  }

  // 获取星数；缓存有效期内直接返回，同一时刻的并发调用共享同一次请求。
  async getStars(): Promise<GitHubStarsState> {
    const cacheFresh = this.lastAttemptAt !== null && Date.now() - this.lastAttemptAt < CACHE_TTL_MS
    if (cacheFresh) return this.getState()
    if (this.inflight) return this.inflight

    this.inflight = this.runFetch().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  private async runFetch(): Promise<GitHubStarsState> {
    const result = await lookupStars()
    this.lastAttemptAt = Date.now()

    if (result === null) {
      // 保留上一次成功值，仅标记失败；未成功过时 stars 保持 null。
      this.failed = true
    } else {
      this.stars = result
      this.fetchedAt = this.lastAttemptAt
      this.failed = false
    }
    return this.getState()
  }
}

export const githubService = new GitHubService()
