import { execFileSync } from "node:child_process"
import type { GitStatus, GitWorktreeEntry } from "@shared/contracts/git"

/**
 * Git 工作区只读状态服务。
 *
 * 仅执行轻量只读命令，不触碰 index/staging、不创建任何仓库或文件；
 * 目录非 git 仓库时静默返回 null（对齐 gitSnapshotService 的能力降级哲学）。
 */
export class GitStatusService {
  // 执行只读 git 命令；非 git 仓库或命令失败返回 null。
  private run(cwd: string, args: string[]): string | null {
    try {
      return execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trimEnd()
    } catch {
      return null
    }
  }

  /**
   * 查询目录的当前分支与工作区变更计数；非 git 仓库返回 null。
   *
   * --porcelain 每行首列两字符编码 X/Y：X 为暂存区相对 HEAD 的状态，Y 为工作树相对暂存区的状态，
   * 未跟踪文件以 ?? 出现；rename/copy 的第二个路径不会另起条目，逐行解析不会误计数。
   */
  getStatus(cwd: string): GitStatus | null {
    const branch = this.run(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])
    if (branch === null) return null

    const porcelain = this.run(cwd, ["status", "--porcelain"])
    let staged = 0
    let unstaged = 0
    let untracked = 0
    for (const line of (porcelain ?? "").split("\n")) {
      if (line.length < 2) continue
      const x = line[0]
      const y = line[1]
      if (x === "?" && y === "?") {
        untracked += 1
      } else {
        if (x !== " ") staged += 1
        if (y !== " ") unstaged += 1
      }
    }

    return { branch, changes: { staged, unstaged, untracked } }
  }

  /**
   * 列出目录所在仓库的全部工作区；非 git 仓库返回 null。
   *
   * --porcelain 每条工作区以 worktree 行开始，branch/detached 行描述检出状态；
   * 首个条目为主工作区（仓库根，即「默认工作区」）。
   */
  listWorktrees(cwd: string): GitWorktreeEntry[] | null {
    const output = this.run(cwd, ["worktree", "list", "--porcelain"])
    if (output === null) return null

    const rawEntries: Array<{ path: string; branch: string | null }> = []
    let current: { path: string; branch: string | null } | null = null
    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current) rawEntries.push(current)
        current = { path: line.slice("worktree ".length), branch: null }
      } else if (line.startsWith("branch refs/heads/")) {
        if (current) current.branch = line.slice("branch refs/heads/".length)
      }
    }
    if (current) rawEntries.push(current)

    // 首个条目为主工作区。
    return rawEntries.map((entry, index) => ({ ...entry, isDefault: index === 0 }))
  }

  /**
   * 列出目录所在仓库的本地分支列表；非 git 仓库返回 null。
   */
  listBranches(cwd: string): string[] | null {
    const output = this.run(cwd, ["branch", "--list", "--format=%(refname:short)"])
    if (output === null) return null

    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }

  /**
   * 检出指定分支；失败时返回详细错误提示。
   */
  checkoutBranch(cwd: string, branch: string): { ok: true } | { ok: false; error: string } {
    try {
      execFileSync("git", ["checkout", branch], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
      return { ok: true }
    } catch (err: unknown) {
      const message =
        err instanceof Error &&
        "stderr" in err &&
        typeof (err as { stderr: unknown }).stderr === "string"
          ? (err as { stderr: string }).stderr.trim()
          : err instanceof Error
            ? err.message
            : "检出分支失败"
      return { ok: false, error: message || "检出分支失败" }
    }
  }
}

// Git 状态服务单例。
export const gitStatusService = new GitStatusService()
