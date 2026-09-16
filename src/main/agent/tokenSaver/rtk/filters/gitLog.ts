// 移植自 9router open-sse/rtk/filters/gitLog.js：压缩 git log，保留提交头与主题行。
import { GIT_LOG_MAX_LINES } from "../constants"

// 压缩 git log：保留 commit/Author/Date/主题/stat 摘要，丢弃正文与内嵌 diff。
export const gitLog = (text: string, maxLines = GIT_LOG_MAX_LINES): string => {
  if (!text) return ""

  const input = String(text)
  const lines = input.split("\n")
  const out: string[] = []
  let skipped = 0
  let inCommit = false
  let subjectSeen = false

  const pushLine = (line: string): boolean => {
    if (out.length < maxLines) {
      out.push(line)
      return true
    }
    skipped++
    return false
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const trimmed = line.trim()

    // commit <sha> 头（含 --graph 装饰前缀）。
    if (
      /^commit [0-9a-f]{7,40}$/i.test(trimmed) ||
      /^[*|/\\ ]+commit [0-9a-f]{7,40}/i.test(trimmed)
    ) {
      inCommit = true
      subjectSeen = false
      pushLine(line)
      continue
    }

    if (inCommit) {
      if (/^[*|/\\ ]*(Author|Date):/i.test(trimmed)) {
        pushLine(trimmed)
        continue
      }
      if (trimmed === "") continue
      // 缩进主题行（首个缩进非空行即主题）。
      if (!subjectSeen && /^[*|/\\ ]*    \S/.test(line)) {
        pushLine(`  Subject: ${trimmed}`)
        subjectSeen = true
        continue
      }
      // stat 摘要行："N file(s) changed, ..."。
      if (/^\d+ file\w* changed/.test(trimmed)) {
        pushLine(`  ${trimmed}`)
        continue
      }
      // 内嵌 diff 头折叠为一行标记。
      if (/^diff --git /.test(trimmed)) {
        pushLine("  ... diff body omitted")
        continue
      }
      continue
    }

    // 非 commit 块（--oneline / --graph）：提取 sha + 主题。
    const graphMatch = trimmed.match(/^[*|/\\ ]+([0-9a-f]{7,40}\s+.+)/i)
    if (graphMatch?.[1]) {
      pushLine(graphMatch[1])
      continue
    }

    if (/^[0-9a-f]{7,40}\s+/.test(trimmed)) {
      pushLine(trimmed)
      continue
    }

    // 纯图形装饰行丢弃。
    if (/^[*|/\\ ]+$/.test(trimmed) && /[*|/\\]/.test(trimmed)) {
      continue
    }

    pushLine(trimmed)
  }

  if (skipped > 0) out.push(`... (${skipped} more lines)`)

  const result = out.join("\n")
  if (!result && input) return input
  if (result.length > input.length) return input
  return result
}
