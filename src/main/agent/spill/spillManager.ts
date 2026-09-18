import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, resolve, sep } from "node:path"
import { getAppDataRoot, sanitizePathSegment } from "@/paths"
import { formatSize, type TruncationResult } from "../tools/truncate"

export interface SpillHandleResult {
  text: string
  spillFilePath?: string
}

export class SpillManager {
  private readonly baseDir: string

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(getAppDataRoot(), "spill")
  }

  getBaseDir(): string {
    return this.baseDir
  }

  // 会话目录：sessionId 消毒后拼接，并校验最终路径仍在 baseDir 内（防目录穿越）。
  getSessionDir(sessionId: string): string {
    const base = resolve(this.baseDir)
    const dir = resolve(base, sanitizePathSegment(sessionId))
    if (dir !== base && !dir.startsWith(`${base}${sep}`)) {
      throw new Error(`[SpillManager] session id escapes base directory: ${sessionId}`)
    }
    return dir
  }

  saveSpillFile(sessionId: string, callId: string, content: string): string {
    const dir = this.getSessionDir(sessionId)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const safeCallId = sanitizePathSegment(callId)
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
    omittedBytes = 0,
  ): string {
    const actionHint =
      customActionHint ?? "Use 'read' tool with offset/limit to inspect specific sections."
    const savedNotice =
      omittedBytes > 0
        ? `Truncated preview saved to: ${spillFilePath}. ${omittedBytes} bytes were dropped upstream (middle omitted) and are not recoverable.`
        : `Full output saved to: ${spillFilePath}.`
    return `\n\n[Output truncated: Showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} / ${formatSize(truncation.totalBytes)}). ${savedNotice} ${actionHint}]`
  }

  handleTruncation(
    rawContent: string,
    truncation: TruncationResult,
    options?: {
      sessionId?: string
      toolCallId?: string
      customActionHint?: string
      // 上游（如统一执行器的 HeadTailBuffer）已丢弃的中间字节数：用于避免"完整保存"的虚假提示。
      omittedBytes?: number
    },
  ): SpillHandleResult {
    if (!truncation.truncated) {
      return { text: rawContent }
    }

    const omittedBytes = options?.omittedBytes ?? 0

    if (options?.sessionId && options?.toolCallId) {
      try {
        const filePath = this.saveSpillFile(options.sessionId, options.toolCallId, rawContent)
        const notice = this.formatSpillNotice(
          filePath,
          truncation,
          options.customActionHint,
          omittedBytes,
        )
        return {
          text: `${truncation.content}${notice}`,
          spillFilePath: filePath,
        }
      } catch (err) {
        console.warn(`[SpillManager] Failed to spill output to disk:`, err)
      }
    }

    const omissionNote =
      omittedBytes > 0
        ? ` ${omittedBytes} bytes were dropped upstream (middle omitted) and are not recoverable.`
        : ""
    const fallbackNotice = `\n\n[Output truncated: Showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} / ${formatSize(truncation.totalBytes)}).${omissionNote}]`
    return {
      text: `${truncation.content}${fallbackNotice}`,
    }
  }
}

export const spillManager = new SpillManager()
