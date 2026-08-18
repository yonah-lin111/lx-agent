import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { formatSize, type TruncationResult } from "../tools/truncate"

export interface SpillHandleResult {
  text: string
  spillFilePath?: string
}

export class SpillManager {
  private readonly baseDir: string

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(homedir(), ".lx", "spill")
  }

  getBaseDir(): string {
    return this.baseDir
  }

  getSessionDir(sessionId: string): string {
    return join(this.baseDir, sessionId)
  }

  saveSpillFile(sessionId: string, callId: string, content: string): string {
    const dir = this.getSessionDir(sessionId)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const safeCallId = callId.replace(/[^a-zA-Z0-9_-]/g, "_")
    const filePath = join(dir, `${safeCallId}.txt`)
    writeFileSync(filePath, content, "utf-8")
    return filePath
  }

  cleanSessionSpill(sessionId: string): void {
    const dir = this.getSessionDir(sessionId)
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch (err) {
        console.warn(`[SpillManager] Failed to clean session spill dir ${dir}:`, err)
      }
    }
  }

  cleanStaleSpills(ttlDays: number = 7): void {
    if (!existsSync(this.baseDir)) return
    const now = Date.now()
    const maxAgeMs = ttlDays * 24 * 60 * 60 * 1000
    try {
      const sessionDirs = readdirSync(this.baseDir)
      for (const sDir of sessionDirs) {
        const fullPath = join(this.baseDir, sDir)
        try {
          const stats = statSync(fullPath)
          if (stats.isDirectory() && now - stats.mtimeMs > maxAgeMs) {
            rmSync(fullPath, { recursive: true, force: true })
          }
        } catch {
          // 忽略单个目录的 stat/delete 异常
        }
      }
    } catch (err) {
      console.warn(`[SpillManager] Failed to clean stale spills:`, err)
    }
  }

  formatSpillNotice(
    spillFilePath: string,
    truncation: TruncationResult,
    customActionHint?: string,
  ): string {
    const actionHint =
      customActionHint ?? "Use 'read' tool with offset/limit to inspect specific sections."
    return `\n\n[Output truncated: Showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} / ${formatSize(truncation.totalBytes)}). Full output saved to: ${spillFilePath}. ${actionHint}]`
  }

  handleTruncation(
    rawContent: string,
    truncation: TruncationResult,
    options?: {
      sessionId?: string
      toolCallId?: string
      customActionHint?: string
    },
  ): SpillHandleResult {
    if (!truncation.truncated) {
      return { text: rawContent }
    }

    if (options?.sessionId && options?.toolCallId) {
      try {
        const filePath = this.saveSpillFile(options.sessionId, options.toolCallId, rawContent)
        const notice = this.formatSpillNotice(filePath, truncation, options.customActionHint)
        return {
          text: `${truncation.content}${notice}`,
          spillFilePath: filePath,
        }
      } catch (err) {
        console.warn(`[SpillManager] Failed to spill output to disk:`, err)
      }
    }

    const fallbackNotice = `\n\n[Output truncated: Showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} / ${formatSize(truncation.totalBytes)}).]`
    return {
      text: `${truncation.content}${fallbackNotice}`,
    }
  }
}

export const spillManager = new SpillManager()
