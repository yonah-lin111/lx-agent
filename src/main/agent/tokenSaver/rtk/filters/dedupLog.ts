// 连续重复行折叠 + 空行去重 + 硬行数上限。
import { DEDUP_LINE_MAX } from "../constants"

// 压缩通用多行日志：合并连续重复行，压缩空行序列，超过上限截断。
export const dedupLog = (input: string): string => {
  const lines = input.split("\n")
  const out: string[] = []
  let prev: string | null = null
  let runCount = 0
  let blankStreak = 0

  const flushRun = (): void => {
    if (prev !== null && runCount > 1) {
      out.push(`  ... (${runCount - 1} duplicate lines)`)
    }
  }

  for (const line of lines) {
    if (line.trim() === "") {
      if (blankStreak < 1) out.push(line)
      blankStreak += 1
      flushRun()
      prev = null
      runCount = 0
      continue
    }
    blankStreak = 0
    if (line === prev) {
      runCount += 1
      continue
    }
    flushRun()
    out.push(line)
    prev = line
    runCount = 1
    if (out.length >= DEDUP_LINE_MAX) {
      out.push(`... (truncated at ${DEDUP_LINE_MAX} lines)`)
      return out.join("\n")
    }
  }
  flushRun()
  return out.join("\n")
}
