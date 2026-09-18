import { GITHUB_REPO } from "@shared/contracts/github"
import type { UpdateState } from "@shared/contracts/update"
import { UPDATE_CHANNELS } from "@shared/ipc/updateChannels"
import { app, type WebContents } from "electron"
import { notificationService } from "@/services/notificationService"

// 唯一分发源：GitHub Releases。
const RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
// 最新 Release 页面地址（接口未返回 html_url 时的兜底）。
const RELEASE_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases/latest`
// 自动检查结果缓存有效期。
const CHECK_CACHE_TTL_MS = 30 * 60 * 1000
// 单次请求超时。
const REQUEST_TIMEOUT_MS = 5000
// 启动后延迟检查，避免与首屏加载抢占资源。
const AUTO_CHECK_DELAY_MS = 3000

// 版本号解析结果。
interface ParsedVersion {
  numbers: number[]
  prerelease: string[]
}

// 版本号前缀与构建元数据不参与比较。
const parseVersion = (raw: string): ParsedVersion | null => {
  const normalized = raw.trim().replace(/^v/i, "").split("+")[0]
  if (!normalized) return null

  const [core, ...rest] = normalized.split("-")
  const numbers = core.split(".").map((part) => Number.parseInt(part, 10))
  if (numbers.length === 0 || numbers.some((value) => Number.isNaN(value))) return null

  return {
    numbers,
    prerelease: rest
      .join("-")
      .split(".")
      .filter((part) => part !== ""),
  }
}

// 预发布标识比较：均无则相等，正式版高于预发布版。
const comparePrerelease = (left: string[], right: string[]): number => {
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1

  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index]
    const rightPart = right[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1

    const leftNumber = /^\d+$/.test(leftPart) ? Number.parseInt(leftPart, 10) : null
    const rightNumber = /^\d+$/.test(rightPart) ? Number.parseInt(rightPart, 10) : null
    if (leftNumber !== null && rightNumber !== null) {
      if (leftNumber !== rightNumber) return leftNumber > rightNumber ? 1 : -1
      continue
    }
    // 数字标识优先级低于字母标识。
    if (leftNumber !== null) return -1
    if (rightNumber !== null) return 1
    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1
  }

  return 0
}

/**
 * 比较两个版本号：left 大于 right 返回正数，小于返回负数，相等或不可比较返回 0。
 */
export const compareVersions = (left: string, right: string): number => {
  const leftVersion = parseVersion(left)
  const rightVersion = parseVersion(right)
  if (!leftVersion || !rightVersion) return 0

  const length = Math.max(leftVersion.numbers.length, rightVersion.numbers.length)
  for (let index = 0; index < length; index += 1) {
    const leftNumber = leftVersion.numbers[index] ?? 0
    const rightNumber = rightVersion.numbers[index] ?? 0
    if (leftNumber !== rightNumber) return leftNumber > rightNumber ? 1 : -1
  }

  return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease)
}

// 远端 Release 查询结果。
type ReleaseLookup =
  | { kind: "release"; version: string; url: string }
  | { kind: "none" }
  | { kind: "failed" }

// 查询最新 Release；404（尚无 Release）视为无更新，其余异常统一视为失败。
const lookupLatestRelease = async (): Promise<ReleaseLookup> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(RELEASE_API_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "lx-agent" },
      signal: controller.signal,
    })
    if (response.status === 404) return { kind: "none" }
    if (!response.ok) return { kind: "failed" }

    const payload = (await response.json()) as { tag_name?: unknown; html_url?: unknown }
    const tag = typeof payload.tag_name === "string" ? payload.tag_name : ""
    const version = tag.replace(/^v/i, "").trim()
    if (!version || !parseVersion(version)) return { kind: "none" }

    const url =
      typeof payload.html_url === "string" && payload.html_url ? payload.html_url : RELEASE_PAGE_URL
    return { kind: "release", version, url }
  } catch {
    return { kind: "failed" }
  } finally {
    clearTimeout(timer)
  }
}

// 除当前版本外的检查快照（当前版本每次实时读取，便于打包与开发态一致）。
type UpdateSnapshot = Omit<UpdateState, "currentVersion">

/**
 * 应用更新服务：查询 GitHub 最新 Release，比较本机版本，并向渲染进程与系统通知广播结果。
 * 自动检查仅在打包态启动时执行一次；手动检查强制绕过缓存。
 */
export class UpdateService {
  private resolveSender: (() => WebContents | undefined) | null = null
  private snapshot: UpdateSnapshot = {
    latestVersion: null,
    hasUpdate: false,
    releaseUrl: null,
    checkedAt: null,
    failed: false,
  }

  // 最近一次真实发起检查的时间，用于自动检查的缓存判定。
  private lastCheckedAt = 0
  private inflight: Promise<UpdateState> | null = null
  // 本次运行已提醒过的版本，避免重复打扰。
  private notifiedVersion: string | null = null

  // 注册渲染进程推送出口。
  attachSender(resolveSender: () => WebContents | undefined): void {
    this.resolveSender = resolveSender
  }

  // 当前状态（不触发网络请求）。
  getState(): UpdateState {
    return { currentVersion: app.getVersion(), ...this.snapshot }
  }

  // 检查更新；force 为 false 时命中缓存直接返回。
  async check(options: { force?: boolean } = {}): Promise<UpdateState> {
    const cacheFresh = Date.now() - this.lastCheckedAt < CHECK_CACHE_TTL_MS
    if (!options.force && cacheFresh) return this.getState()
    if (this.inflight) return this.inflight

    this.inflight = this.runCheck().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  // 打包态启动后延迟执行一次自动检查。
  startAutoCheck(): void {
    if (!app.isPackaged) return
    setTimeout(() => {
      void this.check()
    }, AUTO_CHECK_DELAY_MS)
  }

  private async runCheck(): Promise<UpdateState> {
    const currentVersion = app.getVersion()
    const result = await lookupLatestRelease()
    const checkedAt = Date.now()
    this.lastCheckedAt = checkedAt

    if (result.kind === "failed") {
      // 保留上一次的可用结果，仅标记失败，避免瞬时网络抖动抹掉已知更新。
      this.snapshot = { ...this.snapshot, checkedAt, failed: true }
    } else if (result.kind === "none") {
      this.snapshot = {
        latestVersion: null,
        hasUpdate: false,
        releaseUrl: null,
        checkedAt,
        failed: false,
      }
    } else {
      const hasUpdate = compareVersions(result.version, currentVersion) > 0
      this.snapshot = {
        latestVersion: result.version,
        hasUpdate,
        releaseUrl: result.url,
        checkedAt,
        failed: false,
      }
      if (hasUpdate) this.notifyUpdate(result.version, result.url)
    }

    const state = this.getState()
    this.broadcast(state)
    return state
  }

  // 同一版本在同一进程生命周期内只提醒一次。
  private notifyUpdate(version: string, releaseUrl: string): void {
    if (this.notifiedVersion === version) return
    this.notifiedVersion = version
    notificationService.notifyUpdateAvailable({ version, releaseUrl })
  }

  private broadcast(state: UpdateState): void {
    const sender = this.resolveSender?.()
    if (sender && !sender.isDestroyed()) {
      sender.send(UPDATE_CHANNELS.stateChanged, state)
    }
  }
}

export const updateService = new UpdateService()
