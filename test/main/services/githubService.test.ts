// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GitHubService } from "@/services/githubService"

// GitHub 仓库接口响应替身。
const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as unknown as Response

const REPO_BODY = { stargazers_count: 1234 }
const BASE_TIME = 1_000_000

describe("GitHubService", () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let now: number

  beforeEach(() => {
    now = BASE_TIME
    vi.spyOn(Date, "now").mockImplementation(() => now)
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("成功时返回星标数与成功获取时间", async () => {
    fetchMock.mockResolvedValue(jsonResponse(REPO_BODY))
    const service = new GitHubService()

    await expect(service.getStars()).resolves.toEqual({
      stars: 1234,
      failed: false,
      fetchedAt: BASE_TIME,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("403 限流时标记失败且不抛出，并在缓存窗口内不重试", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "rate limited" }, 403))
    const service = new GitHubService()

    await expect(service.getStars()).resolves.toEqual({
      stars: null,
      failed: true,
      fetchedAt: null,
    })
    await service.getStars()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("网络异常时标记失败并保留上一次成功值", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(REPO_BODY))
    const service = new GitHubService()
    await service.getStars()

    now += 31 * 60 * 1000
    fetchMock.mockRejectedValueOnce(new Error("offline"))

    await expect(service.getStars()).resolves.toEqual({
      stars: 1234,
      failed: true,
      fetchedAt: BASE_TIME,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("响应缺少 stargazers_count 时按失败处理", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "weird payload" }))
    const service = new GitHubService()

    await expect(service.getStars()).resolves.toEqual({
      stars: null,
      failed: true,
      fetchedAt: null,
    })
  })

  it("缓存有效期内重复调用不再发起请求", async () => {
    fetchMock.mockResolvedValue(jsonResponse(REPO_BODY))
    const service = new GitHubService()

    await service.getStars()
    now += 29 * 60 * 1000
    await service.getStars()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("缓存过期后重新请求并更新星数", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(REPO_BODY))
    const service = new GitHubService()
    await service.getStars()

    now += 31 * 60 * 1000
    fetchMock.mockResolvedValueOnce(jsonResponse({ stargazers_count: 1300 }))

    await expect(service.getStars()).resolves.toEqual({
      stars: 1300,
      failed: false,
      fetchedAt: now,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
