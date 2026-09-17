// @vitest-environment node
import type { UpdateState } from "@shared/contracts/update"
import { UPDATE_CHANNELS } from "@shared/ipc/updateChannels"
import type { WebContents } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({
  version: "0.1.0",
  packaged: false,
  notifyUpdateAvailable: vi.fn(),
}))

vi.mock("electron", () => ({
  app: {
    getVersion: () => holder.version,
    get isPackaged() {
      return holder.packaged
    },
  },
}))

vi.mock("@/services/notificationService", () => ({
  notificationService: { notifyUpdateAvailable: holder.notifyUpdateAvailable },
}))

import { compareVersions, UpdateService } from "@/services/updateService"

const RELEASE_PAGE = "https://github.com/yonah-lin111/lx-agent/releases/tag/v0.2.0"

// GitHub Releases 接口响应替身。
const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as unknown as Response

const releaseBody = (tag: string): unknown => ({ tag_name: tag, html_url: RELEASE_PAGE })

// 渲染进程出口替身。
const createSender = (): { isDestroyed: () => boolean; send: ReturnType<typeof vi.fn> } => ({
  isDestroyed: () => false,
  send: vi.fn(),
})

const attachSender = (service: UpdateService, sender: ReturnType<typeof createSender>): void => {
  service.attachSender(() => sender as unknown as WebContents)
}

describe("compareVersions", () => {
  it("按数值比较主次修订位而非字典序", () => {
    expect(compareVersions("0.2.0", "0.1.0")).toBeGreaterThan(0)
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0)
    expect(compareVersions("1.0.0", "0.99.99")).toBeGreaterThan(0)
    expect(compareVersions("0.1.0", "0.1.1")).toBeLessThan(0)
  })

  it("忽略 v 前缀并容忍位数缺失", () => {
    expect(compareVersions("v0.2.0", "0.2.0")).toBe(0)
    expect(compareVersions("1.2", "1.2.0")).toBe(0)
    expect(compareVersions("1.2.1", "1.2")).toBeGreaterThan(0)
  })

  it("正式版高于预发布版，预发布标识按数值与字典序比较", () => {
    expect(compareVersions("1.0.0", "1.0.0-beta.1")).toBeGreaterThan(0)
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBeLessThan(0)
    expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.1")).toBeGreaterThan(0)
    expect(compareVersions("1.0.0-beta.10", "1.0.0-beta.9")).toBeGreaterThan(0)
    expect(compareVersions("1.0.0-beta.1", "1.0.0-beta.1")).toBe(0)
  })

  it("不可比较的版本号视为相等", () => {
    expect(compareVersions("latest", "0.1.0")).toBe(0)
    expect(compareVersions("0.1.0", "")).toBe(0)
  })
})

describe("UpdateService", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    holder.version = "0.1.0"
    holder.packaged = false
    holder.notifyUpdateAvailable.mockClear()
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("发现更高版本时置位状态、广播并提醒一次", async () => {
    fetchMock.mockResolvedValue(jsonResponse(releaseBody("v0.2.0")))
    const service = new UpdateService()
    const sender = createSender()
    attachSender(service, sender)

    const state = await service.check()

    expect(state).toMatchObject({
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      hasUpdate: true,
      releaseUrl: RELEASE_PAGE,
      failed: false,
    })
    expect(state.checkedAt).toEqual(expect.any(Number))
    expect(holder.notifyUpdateAvailable).toHaveBeenCalledTimes(1)
    expect(holder.notifyUpdateAvailable).toHaveBeenCalledWith({
      version: "0.2.0",
      releaseUrl: RELEASE_PAGE,
    })
    expect(sender.send).toHaveBeenCalledWith(UPDATE_CHANNELS.stateChanged, expect.any(Object))
  })

  it("同一版本在一次运行内不重复提醒", async () => {
    fetchMock.mockResolvedValue(jsonResponse(releaseBody("v0.2.0")))
    const service = new UpdateService()

    await service.check({ force: true })
    await service.check({ force: true })

    expect(holder.notifyUpdateAvailable).toHaveBeenCalledTimes(1)
  })

  it("远端版本不高于本机时不提醒且不置位更新", async () => {
    fetchMock.mockResolvedValue(jsonResponse(releaseBody("v0.1.0")))
    const service = new UpdateService()

    const state = await service.check()

    expect(state.hasUpdate).toBe(false)
    expect(state.latestVersion).toBe("0.1.0")
    expect(holder.notifyUpdateAvailable).not.toHaveBeenCalled()
  })

  it("尚无 Release（404）视为已是最新且不标记失败", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Not Found" }, 404))
    const service = new UpdateService()

    const state = await service.check()

    expect(state).toMatchObject({ hasUpdate: false, latestVersion: null, failed: false })
  })

  it("接口非 2xx 时标记失败", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "rate limited" }, 403))
    const service = new UpdateService()

    const state = await service.check()

    expect(state.failed).toBe(true)
  })

  it("网络异常标记失败并保留上一次可用结果", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(releaseBody("v0.2.0")))
    const service = new UpdateService()
    await service.check({ force: true })

    fetchMock.mockRejectedValueOnce(new Error("offline"))
    const state = await service.check({ force: true })

    expect(state.failed).toBe(true)
    expect(state.latestVersion).toBe("0.2.0")
    expect(state.hasUpdate).toBe(true)
  })

  it("tag 不可解析时视为无更新", async () => {
    fetchMock.mockResolvedValue(jsonResponse(releaseBody("nightly")))
    const service = new UpdateService()

    const state = await service.check()

    expect(state).toMatchObject({ hasUpdate: false, latestVersion: null, failed: false })
  })

  it("未强制刷新时命中缓存不重复请求", async () => {
    fetchMock.mockResolvedValue(jsonResponse(releaseBody("v0.2.0")))
    const service = new UpdateService()

    await service.check()
    await service.check()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("强制刷新绕过缓存并复用并发请求", async () => {
    fetchMock.mockResolvedValue(jsonResponse(releaseBody("v0.2.0")))
    const service = new UpdateService()

    const [first, second] = await Promise.all([service.check({ force: true }), service.check()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
  })

  it("请求超时标记失败", async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_url: string, init: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")))
        }),
    )
    const service = new UpdateService()

    const pending = service.check()
    await vi.advanceTimersByTimeAsync(5000)
    const state = await pending

    expect(state.failed).toBe(true)
  })

  it("自动检查仅在打包态启动后延迟触发", async () => {
    fetchMock.mockResolvedValue(jsonResponse(releaseBody("v0.2.0")))
    vi.useFakeTimers()

    const devService = new UpdateService()
    devService.startAutoCheck()
    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchMock).not.toHaveBeenCalled()

    holder.packaged = true
    const packagedService = new UpdateService()
    packagedService.startAutoCheck()
    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("未注册推送出口时不抛错", async () => {
    fetchMock.mockResolvedValue(jsonResponse(releaseBody("v0.2.0")))
    const service = new UpdateService()

    const state: UpdateState = await service.check()

    expect(state.hasUpdate).toBe(true)
  })
})
