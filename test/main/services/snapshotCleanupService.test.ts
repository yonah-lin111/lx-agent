import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// appData 与数据库根集合均以内存态注入，隔离真实用户目录。
const holder = vi.hoisted(() => ({ appDataRoot: "", filesChanged: [] as string[] }))
vi.mock("@/paths", () => ({ getAppDataRoot: () => holder.appDataRoot }))
vi.mock("@/services/agentSessionService", () => ({
  agentSessionService: { listSnapshotFilesChanged: () => holder.filesChanged },
}))

import { gitSnapshotService } from "@/services/gitSnapshotService"
import { cleanOrphanSnapshotBlobs } from "@/services/snapshotCleanupService"

let workDir: string
let appDataDir: string

// 共享 blob 仓库中某个 blob 的松散对象路径。
const objectPath = (blob: string): string =>
  join(appDataDir, "snapshots", "store", ".git", "objects", blob.slice(0, 2), blob.slice(2))

// 创建内容写入共享仓库并返回 blob 哈希。
const captureBlob = (name: string, content: string): string => {
  writeFileSync(join(workDir, name), content, "utf8")
  const blob = gitSnapshotService.hashFile(join(workDir, name))
  if (!blob) throw new Error("capture failed")
  return blob
}

// 把 blob 对象文件调整为指定天数前落盘。
const ageBlob = (blob: string, days: number): void => {
  const past = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  utimesSync(objectPath(blob), past, past)
}

describe("snapshotCleanupService", () => {
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "lx-snapclean-"))
    appDataDir = mkdtempSync(join(tmpdir(), "lx-snapclean-appdata-"))
    holder.appDataRoot = appDataDir
    holder.filesChanged = []
  })

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
    rmSync(appDataDir, { recursive: true, force: true })
  })

  it("保留存活引用的 blob 与宽限期内新 blob，删除过期孤儿", () => {
    const keep = captureBlob("keep.txt", "keep\n")
    const trash = captureBlob("trash.txt", "trash\n")
    const fresh = captureBlob("fresh.txt", "fresh\n")
    ageBlob(keep, 7)
    ageBlob(trash, 7)
    holder.filesChanged = [JSON.stringify([{ status: "M", file: "keep.txt", blob: keep }])]

    cleanOrphanSnapshotBlobs()

    expect(existsSync(objectPath(keep))).toBe(true)
    expect(existsSync(objectPath(trash))).toBe(false)
    expect(existsSync(objectPath(fresh))).toBe(true)
  })

  it("根集合解析失败时放弃本轮回收（不误删任何对象）", () => {
    const trash = captureBlob("trash.txt", "trash\n")
    ageBlob(trash, 7)
    holder.filesChanged = ["{ not json"]

    cleanOrphanSnapshotBlobs()

    expect(existsSync(objectPath(trash))).toBe(true)
  })

  it("兼容旧格式行（数组元素无 blob 字段）且无引用时清除过期对象", () => {
    const trash = captureBlob("trash.txt", "trash\n")
    ageBlob(trash, 7)
    holder.filesChanged = [JSON.stringify(["a.ts", "b.ts"])]

    cleanOrphanSnapshotBlobs()

    expect(existsSync(objectPath(trash))).toBe(false)
  })
})
