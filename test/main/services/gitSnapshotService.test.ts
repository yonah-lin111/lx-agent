import { execFileSync } from "node:child_process"
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

const runGit = (args: string[], cwd = workDir): void => {
  execFileSync("git", args, { cwd, stdio: "ignore" })
}

describe("gitSnapshotService", () => {
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "lx-git-snap-"))
    appDataDir = mkdtempSync(join(tmpdir(), "lx-git-appdata-"))
    holder.appDataRoot = appDataDir
    runGit(["init", "-q"])
    writeFileSync(join(workDir, "base.txt"), "v1\n", "utf8")
    runGit(["add", "-A"])
    runGit(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init"])
  })

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
    rmSync(appDataDir, { recursive: true, force: true })
  })

  it("捕获快照、计算变更并回滚到起始快照", () => {
    const start = gitSnapshotService.capture(workDir)
    expect(start).toBeTruthy()

    // 修改 + 新增。
    writeFileSync(join(workDir, "base.txt"), "v2\n", "utf8")
    writeFileSync(join(workDir, "new.txt"), "new\n", "utf8")
    const end = gitSnapshotService.capture(workDir)
    expect(end).toBeTruthy()
    expect(end).not.toBe(start)

    const changes = gitSnapshotService.diff(start!, end!, workDir)
    expect(changes).toEqual(
      expect.arrayContaining([
        { status: "M", file: "base.txt" },
        { status: "A", file: "new.txt" },
      ]),
    )

    // 回滚到起始快照：base.txt 恢复 v1，new.txt 删除。
    gitSnapshotService.revert(workDir, start!, changes)
    expect(readFileSync(join(workDir, "base.txt"), "utf8")).toBe("v1\n")
    expect(existsSync(join(workDir, "new.txt"))).toBe(false)
  })

  it("无变更时两次快照哈希相同（不产生 diff 项）", () => {
    const start = gitSnapshotService.capture(workDir)
    const end = gitSnapshotService.capture(workDir)
    expect(start).toBe(end)
    expect(gitSnapshotService.diff(start!, end!, workDir)).toEqual([])
  })

  it("非 git 仓库返回 null / 空（静默降级）", () => {
    const plainDir = mkdtempSync(join(tmpdir(), "lx-plain-"))
    try {
      expect(gitSnapshotService.capture(plainDir)).toBeNull()
      expect(gitSnapshotService.diff("a", "b", plainDir)).toEqual([])
    } finally {
      rmSync(plainDir, { recursive: true, force: true })
    }
  })
})
