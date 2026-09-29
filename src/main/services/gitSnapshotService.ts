import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { getAppDataRoot } from "@/paths"

// 文件变更项（新增/修改/删除；新格式携带文件级前置镜像 blob）。
export interface SnapshotFileChange {
  status: "A" | "M" | "D"
  file: string
  // 文件级前置镜像的 git blob 哈希（新格式；缺失时按旧格式 hash_start tree 回滚）。
  blob?: string
}

// 大文件 blob 读取上限（默认 1MB 不够，快照恢复按内容整体写回）。
const MAX_BLOB_BYTES = 64 * 1024 * 1024

/**
 * Git 工作树快照服务。
 *
 * 对每个 cwd 建**隐藏 git 仓库**（{appData}/snapshots/{cwdHash}/.git）：cwd 为 git 仓库时
 * object DB 经 alternates 复用真实仓库的 objects（不重复存储），普通目录独立存储；
 * 快照操作一律 `--git-dir <hidden>`，不触碰真实仓库的 index/staging。
 *
 * 新快照为**文件级前置镜像**：写工具执行前把目标文件当前内容落为 blob（内容寻址去重），
 * 回退时逐文件写回/删除，不依赖 cwd 是否为 git 仓库；历史整树快照（hash_start tree）
 * 仍经 restoreSnapshot 内 git checkout 分支回滚。
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

  // 确保隐藏仓库就绪并返回其 git-dir；初始化失败返回 null。
  private ensureRepo(cwd: string): string | null {
    const gitDir = join(getAppDataRoot(), "snapshots", this.hashCwd(cwd), ".git")
    if (!existsSync(gitDir)) {
      const hiddenDir = join(getAppDataRoot(), "snapshots", this.hashCwd(cwd))
      mkdirSync(hiddenDir, { recursive: true })
      execFileSync("git", ["init", "-q"], { cwd: hiddenDir, stdio: "ignore" })
      // git 工作区：object DB 经 alternates 复用真实仓库 objects；普通目录独立存储。
      const realGitDir = this.findRealGitDir(cwd)
      if (realGitDir) {
        const objectsDir = join(realGitDir, "objects")
        mkdirSync(join(gitDir, "objects", "info"), { recursive: true })
        writeFileSync(join(gitDir, "objects", "info", "alternates"), `${objectsDir}\n`, "utf8")
      }
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

  // 将文件当前内容写入隐藏仓库对象库并返回 blob 哈希（内容寻址去重）；失败返回 null。
  hashFile(cwd: string, absolutePath: string): string | null {
    try {
      return this.run(cwd, ["hash-object", "-w", "--", absolutePath]) || null
    } catch {
      return null
    }
  }

  // 将 blob 内容写回工作区文件（二进制安全，自动创建父目录）；失败静默降级。
  restoreBlob(cwd: string, blob: string, file: string): void {
    try {
      const gitDir = this.ensureRepo(cwd)
      if (!gitDir) return
      const content = execFileSync("git", ["--git-dir", gitDir, "cat-file", "blob", blob], {
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: MAX_BLOB_BYTES,
      })
      const absolute = join(cwd, file)
      mkdirSync(dirname(absolute), { recursive: true })
      writeFileSync(absolute, content)
    } catch {
      // 快照损坏恢复失败：静默降级（尽力而为）。
    }
  }

  // 回滚到旧格式整树快照 hash_start（仅按变更列表选择性 git checkout，不触碰其余文件）。
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

  // 恢复一个快照的变更列表：旧格式（hash_start tree）走 git checkout；新格式逐文件写回前置镜像。
  restoreSnapshot(cwd: string, hashStart: string, changes: SnapshotFileChange[]): void {
    if (hashStart) {
      this.revert(cwd, hashStart, changes)
      return
    }
    for (const change of changes) {
      if (change.status === "A") {
        rmSync(join(cwd, change.file), { force: true })
        continue
      }
      if (!change.blob) continue
      this.restoreBlob(cwd, change.blob, change.file)
    }
  }
}

// Git 快照服务单例。
export const gitSnapshotService = new GitSnapshotService()
