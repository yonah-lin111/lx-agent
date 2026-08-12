import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { gitStatusService } from "@/services/gitStatusService"

let workDir: string

const runGit = (args: string[]): void => {
  execFileSync("git", args, { cwd: workDir, stdio: "ignore" })
}

describe("gitStatusService", () => {
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "lx-git-status-"))
    runGit(["init", "-q"])
    runGit(["config", "user.name", "t"])
    runGit(["config", "user.email", "t@t"])
  })

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  it("非 git 目录返回 null", () => {
    const plainDir = mkdtempSync(join(tmpdir(), "lx-git-status-plain-"))
    try {
      expect(gitStatusService.getStatus(plainDir)).toBeNull()
    } finally {
      rmSync(plainDir, { recursive: true, force: true })
    }
  })

  it("干净仓库返回当前分支与零变更", () => {
    runGit(["checkout", "-b", "main"])
    writeFileSync(join(workDir, "base.txt"), "v1\n", "utf8")
    runGit(["add", "-A"])
    runGit(["commit", "-q", "-m", "init"])

    expect(gitStatusService.getStatus(workDir)).toEqual({
      branch: "main",
      changes: { staged: 0, unstaged: 0, untracked: 0 },
    })
  })

  it("分类统计 staged / unstaged / untracked 变更", () => {
    runGit(["checkout", "-b", "main"])
    writeFileSync(join(workDir, "base.txt"), "v1\n", "utf8")
    runGit(["add", "-A"])
    runGit(["commit", "-q", "-m", "init"])

    // staged：修改后已暂存。
    writeFileSync(join(workDir, "base.txt"), "v2\n", "utf8")
    runGit(["add", "base.txt"])
    // unstaged：已跟踪文件再次修改未暂存。
    writeFileSync(join(workDir, "base.txt"), "v3\n", "utf8")
    // untracked：新文件。
    writeFileSync(join(workDir, "new.txt"), "n\n", "utf8")

    expect(gitStatusService.getStatus(workDir)).toEqual({
      branch: "main",
      changes: { staged: 1, unstaged: 1, untracked: 1 },
    })
  })

  it("重命名文件只计一次 staged，不误计 unstaged", () => {
    runGit(["checkout", "-b", "main"])
    writeFileSync(join(workDir, "old.txt"), "v1\n", "utf8")
    runGit(["add", "-A"])
    runGit(["commit", "-q", "-m", "init"])
    runGit(["mv", "old.txt", "new.txt"])

    expect(gitStatusService.getStatus(workDir)).toEqual({
      branch: "main",
      changes: { staged: 1, unstaged: 0, untracked: 0 },
    })
  })
})
