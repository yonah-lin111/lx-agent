import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import { getAppDataRoot } from "@/paths"

// 文件变更项（hash_start → hash_end 的变更列表）。
export interface SnapshotFileChange {
  status: "A" | "M" | "D"
  file: string
}

/**
 * Git 工作树快照服务（对齐 opencode snapshot/index.ts）。
 *
 * 对每个 cwd 建**隐藏 git 仓库**（{appData}/snapshots/{cwdHash}/.git），object DB 经 alternates
 * 复用真实仓库的 objects（不重复存储）；快照操作一律 `--git-dir <hidden> --work-tree <cwd>`，
 * 不触碰真实仓库的 index/staging。cwd 非 git 仓库时所有操作静默返回 null/[]（能力降级）。
 */
export class GitSnapshotService {
  // 真实 git 目录；cwd 非 git 仓库（rev-parse 失败）返回 null。
  private findRealGitDir(cwd: string): string | null {
    try {
      const output = execFileSync("git", ["rev-parse", "--git-dir"], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim()
      if (!output) return null
      const absolute = isAbsolute(output) ? output : resolve(cwd, output)
      return existsSync(absolute) ? absolute : null
    } catch {
      return null
    }
  }

  // cwd 的稳定哈希（隐藏仓库目录名）。
  private hashCwd(cwd: string): string {
    return createHash("sha256").update(cwd).digest("hex").slice(0, 12)
  }

  // 确保隐藏仓库就绪并返回其 git-dir；非 git 仓库返回 null。
  private ensureRepo(cwd: string): string | null {
    const realGitDir = this.findRealGitDir(cwd)
    if (!realGitDir) return null
    const gitDir = join(getAppDataRoot(), "snapshots", this.hashCwd(cwd), ".git")
    if (!existsSync(gitDir)) {
      const hiddenDir = join(getAppDataRoot(), "snapshots", this.hashCwd(cwd))
      mkdirSync(hiddenDir, { recursive: true })
      execFileSync("git", ["init", "-q"], { cwd: hiddenDir, stdio: "ignore" })
      // object DB 经 alternates 复用真实仓库 objects（共享哈希，避免重复存储）。
      const objectsDir = join(realGitDir, "objects")
      mkdirSync(join(gitDir, "objects", "info"), { recursive: true })
      writeFileSync(join(gitDir, "objects", "info", "alternates"), `${objectsDir}\n`, "utf8")
    }
    return gitDir
  }

  private run(cwd: string, args: string[]): string {
    const gitDir = this.ensureRepo(cwd)
    if (!gitDir) throw new Error("Not a git repository")
    return execFileSync("git", ["--git-dir", gitDir, "--work-tree", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  }

  // 捕获当前工作树快照（tree hash）；非 git / 失败返回 null（静默降级）。
  capture(cwd: string): string | null {
    try {
      this.run(cwd, ["add", "-A"])
      return this.run(cwd, ["write-tree"])
    } catch {
      return null
    }
  }

  // 两次快照间的变更文件列表；非 git / 失败返回 []。
  diff(start: string, end: string, cwd: string): SnapshotFileChange[] {
    try {
      const output = this.run(cwd, ["diff", "--name-status", start, end])
      return output
        .split("\n")
        .filter(Boolean)
        .flatMap((line): SnapshotFileChange[] => {
          const [status, ...rest] = line.split("\t")
          const file = rest.join("\t")
          if (!file || (status !== "A" && status !== "M" && status !== "D")) return []
          return [{ status, file }]
        })
    } catch {
      return []
    }
  }

  // 回滚到 hash_start 快照（仅按变更列表选择性操作，不触碰其余文件）。
  revert(cwd: string, start: string, changes: SnapshotFileChange[]): void {
    try {
      for (const change of changes) {
        if (change.status === "A") {
          // 该轮新增的文件：删除。
          rmSync(join(cwd, change.file), { force: true })
        } else {
          // 修改/删除：从 hash_start 检出恢复（M → 恢复旧版；D → 重新创建）。
          this.run(cwd, ["checkout", start, "--", change.file])
        }
      }
    } catch {
      // 回滚失败静默降级（尽力而为，不阻断删除轮次）。
    }
  }
}

// Git 快照服务单例。
export const gitSnapshotService = new GitSnapshotService()
