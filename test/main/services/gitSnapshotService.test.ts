import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// appData 指向临时目录（快照仓库建于此，隔离真实用户目录）。
const holder = vi.hoisted(() => ({ appDataRoot: "" }))
vi.mock("@/paths", () => ({ getAppDataRoot: () => holder.appDataRoot }))

import { gitSnapshotService } from "@/services/gitSnapshotService"

let workDir: string
let appDataDir: string

describe("gitSnapshotService", () => {
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "lx-snap-"))
    appDataDir = mkdtempSync(join(tmpdir(), "lx-snap-appdata-"))
    holder.appDataRoot = appDataDir
  })

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
    rmSync(appDataDir, { recursive: true, force: true })
  })

  it("非 git 目录：捕获文件前置镜像并按变更列表恢复（修改还原 / 新增删除）", () => {
    writeFileSync(join(workDir, "base.txt"), "v1\n", "utf8")
    const blob = gitSnapshotService.hashFile(join(workDir, "base.txt"))
    expect(blob).toBeTruthy()

    // 修改 + 新增。
    writeFileSync(join(workDir, "base.txt"), "v2\n", "utf8")
    writeFileSync(join(workDir, "new.txt"), "new\n", "utf8")

    gitSnapshotService.restoreSnapshot(workDir, "", [
      { status: "M", file: "base.txt", blob: blob! },
      { status: "A", file: "new.txt" },
    ])

    expect(readFileSync(join(workDir, "base.txt"), "utf8")).toBe("v1\n")
    expect(existsSync(join(workDir, "new.txt"))).toBe(false)
  })

  it("删除的文件可从前置镜像重建（D）", () => {
    writeFileSync(join(workDir, "gone.txt"), "content\n", "utf8")
    const blob = gitSnapshotService.hashFile(join(workDir, "gone.txt"))
    expect(blob).toBeTruthy()
    rmSync(join(workDir, "gone.txt"))

    gitSnapshotService.restoreSnapshot(workDir, "", [
      { status: "D", file: "gone.txt", blob: blob! },
    ])

    expect(readFileSync(join(workDir, "gone.txt"), "utf8")).toBe("content\n")
  })

  it("多个工作区共享同一 blob 仓库，不按目录建库（同内容同 blob）", () => {
    const otherDir = mkdtempSync(join(tmpdir(), "lx-snap-other-"))
    try {
      writeFileSync(join(workDir, "same.txt"), "same\n", "utf8")
      writeFileSync(join(otherDir, "same.txt"), "same\n", "utf8")

      const blobA = gitSnapshotService.hashFile(join(workDir, "same.txt"))
      const blobB = gitSnapshotService.hashFile(join(otherDir, "same.txt"))
      expect(blobA).toBeTruthy()
      expect(blobB).toBe(blobA)

      // 只存在共享仓库目录，不产生任何按 cwd 命名的隐藏仓库。
      expect(readdirSync(join(appDataDir, "snapshots"))).toEqual(["store"])

      // 跨工作区恢复：用 otherDir 的 blob 写回 workDir。
      writeFileSync(join(workDir, "same.txt"), "changed\n", "utf8")
      gitSnapshotService.restoreSnapshot(workDir, "", [
        { status: "M", file: "same.txt", blob: blobA! },
      ])
      expect(readFileSync(join(workDir, "same.txt"), "utf8")).toBe("same\n")
    } finally {
      rmSync(otherDir, { recursive: true, force: true })
    }
  })

  it("pruneBlobs：仅删除过期且未被引用的松散对象，保留引用与宽限期内对象", () => {
    writeFileSync(join(workDir, "keep.txt"), "keep\n", "utf8")
    writeFileSync(join(workDir, "trash.txt"), "trash\n", "utf8")
    writeFileSync(join(workDir, "fresh.txt"), "fresh\n", "utf8")
    const keep = gitSnapshotService.hashFile(join(workDir, "keep.txt"))!
    const trash = gitSnapshotService.hashFile(join(workDir, "trash.txt"))!
    const fresh = gitSnapshotService.hashFile(join(workDir, "fresh.txt"))!
    const objectsDir = join(appDataDir, "snapshots", "store", ".git", "objects")
    const objectPath = (hash: string): string => join(objectsDir, hash.slice(0, 2), hash.slice(2))

    // keep 与 trash 调整为一周前落盘：引用存活根不受年龄影响，孤儿超过宽限期被清除。
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    utimesSync(objectPath(keep), lastWeek, lastWeek)
    utimesSync(objectPath(trash), lastWeek, lastWeek)

    const result = gitSnapshotService.pruneBlobs(new Set([keep]))

    expect(result.removed).toBe(1)
    expect(result.kept).toBe(2)
    expect(result.freedBytes).toBeGreaterThan(0)
    expect(existsSync(objectPath(trash))).toBe(false)
    expect(existsSync(objectPath(keep))).toBe(true)
    expect(existsSync(objectPath(fresh))).toBe(true)
    // pack / info 目录不受影响。
    expect(existsSync(join(objectsDir, "pack"))).toBe(true)
  })

  it("pruneBlobs：共享仓库不存在时返回零统计", () => {
    expect(gitSnapshotService.pruneBlobs(new Set())).toEqual({
      removed: 0,
      kept: 0,
      freedBytes: 0,
    })
  })

  it("历史整树快照：hash_start 非空时仍按 git checkout 回滚", () => {
    execFileSync("git", ["init", "-q"], { cwd: workDir, stdio: "ignore" })
    writeFileSync(join(workDir, "base.txt"), "v1\n", "utf8")
    // 手工初始化该 cwd 的隐藏仓库（历史快照仓库路径）并构建 v1 快照 tree。
    const hiddenDir = join(
      appDataDir,
      "snapshots",
      createHash("sha256").update(workDir).digest("hex").slice(0, 12),
    )
    const gitDir = join(hiddenDir, ".git")
    mkdirSync(hiddenDir, { recursive: true })
    execFileSync("git", ["init", "-q"], { cwd: hiddenDir, stdio: "ignore" })
    execFileSync("git", ["--git-dir", gitDir, "--work-tree", workDir, "add", "-A"], {
      stdio: "ignore",
    })
    const tree = execFileSync("git", ["--git-dir", gitDir, "--work-tree", workDir, "write-tree"], {
      encoding: "utf8",
    }).trim()

    writeFileSync(join(workDir, "base.txt"), "v2\n", "utf8")
    gitSnapshotService.restoreSnapshot(workDir, tree, [{ status: "M", file: "base.txt" }])

    expect(readFileSync(join(workDir, "base.txt"), "utf8")).toBe("v1\n")
  })
})
