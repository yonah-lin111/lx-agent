import { execFileSync } from "node:child_process"
import type { GitStatus } from "@shared/contracts/git"

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
      }).trim()
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
}

// Git 状态服务单例。
export const gitStatusService = new GitStatusService()
