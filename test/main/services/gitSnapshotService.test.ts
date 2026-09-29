import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// appData 指向临时目录（隐藏 git 仓库建于此，隔离真实用户目录）。
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
    const blob = gitSnapshotService.hashFile(workDir, join(workDir, "base.txt"))
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
    const blob = gitSnapshotService.hashFile(workDir, join(workDir, "gone.txt"))
    expect(blob).toBeTruthy()
    rmSync(join(workDir, "gone.txt"))

    gitSnapshotService.restoreSnapshot(workDir, "", [
      { status: "D", file: "gone.txt", blob: blob! },
    ])

    expect(readFileSync(join(workDir, "gone.txt"), "utf8")).toBe("content\n")
  })

  it("历史整树快照：hash_start 非空时仍按 git checkout 回滚", () => {
    execFileSync("git", ["init", "-q"], { cwd: workDir, stdio: "ignore" })
    writeFileSync(join(workDir, "base.txt"), "v1\n", "utf8")
    // 触发隐藏仓库初始化后手工构建 v1 快照 tree（模拟历史行的 hash_start）。
    expect(gitSnapshotService.hashFile(workDir, join(workDir, "base.txt"))).toBeTruthy()
    const gitDir = join(
      appDataDir,
      "snapshots",
      createHash("sha256").update(workDir).digest("hex").slice(0, 12),
      ".git",
    )
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
