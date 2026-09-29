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
 * Git 快照服务。
 *
 * 文件级前置镜像统一存于**共享 blob 仓库**（{appData}/snapshots/store/.git）：blob 内容寻址，
 * 跨工作区天然去重，无需按 cwd 建库，也不触碰工作区（不建 .git、不改 index/staging）。
 *
 * 历史整树快照（hash_start tree）仍按 cwd 使用独立隐藏仓库（{appData}/snapshots/{cwdHash}/.git，
 * git 仓库经 alternates 复用真实仓库 objects），restoreSnapshot 检测到 hash_start 时走 checkout。
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

  // cwd 的稳定哈希（历史整树快照的隐藏仓库目录名）。
  private hashCwd(cwd: string): string {
    return createHash("sha256").update(cwd).digest("hex").slice(0, 12)
  }

  // cwd 的隐藏仓库（历史整树快照专用）；初始化失败返回 null。
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

  // 共享 blob 仓库（所有工作区的文件前置镜像统一存储）；初始化失败返回 null。
  private ensureBlobStore(): string | null {
    try {
      const storeDir = join(getAppDataRoot(), "snapshots", "store")
      const gitDir = join(storeDir, ".git")
      if (!existsSync(gitDir)) {
        mkdirSync(storeDir, { recursive: true })
        execFileSync("git", ["init", "-q"], { cwd: storeDir, stdio: "ignore" })
      }
      return gitDir
    } catch {
      return null
    }
  }

  private run(cwd: string, args: string[]): string {
    const gitDir = this.ensureRepo(cwd)
    if (!gitDir) throw new Error("Not a git repository")
    return execFileSync("git", ["--git-dir", gitDir, "--work-tree", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  }

  // 将文件当前内容写入共享 blob 仓库并返回 blob 哈希（内容寻址去重，跨工作区共享）；失败返回 null。
  hashFile(absolutePath: string): string | null {
    try {
      const gitDir = this.ensureBlobStore()
      if (!gitDir) return null
      const output = execFileSync(
        "git",
        ["--git-dir", gitDir, "hash-object", "-w", "--", absolutePath],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ).trim()
      return output || null
    } catch {
      return null
    }
  }

  // 将共享仓库中的 blob 写回目标文件（二进制安全，自动创建父目录）；失败静默降级。
  restoreBlob(blob: string, absolutePath: string): void {
    try {
      const gitDir = this.ensureBlobStore()
      if (!gitDir) return
      const content = execFileSync("git", ["--git-dir", gitDir, "cat-file", "blob", blob], {
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: MAX_BLOB_BYTES,
      })
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, content)
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
      const absolute = join(cwd, change.file)
      if (change.status === "A") {
        rmSync(absolute, { force: true })
        continue
      }
      if (!change.blob) continue
      this.restoreBlob(change.blob, absolute)
    }
  }
}

// Git 快照服务单例。
export const gitSnapshotService = new GitSnapshotService()
