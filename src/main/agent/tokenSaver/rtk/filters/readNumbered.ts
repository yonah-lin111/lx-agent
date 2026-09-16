// 移植自 9router open-sse/rtk/filters/readNumbered.js：带行号文件输出（"  N|content"）头尾截断。
import { SMART_TRUNCATE_HEAD, SMART_TRUNCATE_MIN_LINES, SMART_TRUNCATE_TAIL } from "../constants"

// 带行号文件行格式。
export const READ_NUMBERED_LINE_RE = /^\s*\d+\|/

// 压缩带行号文件输出：保留头部与尾部，中部折叠并标注文件未结束。
export const readNumbered = (input: string): string => {
  const lines = input.split("\n")
  if (lines.length < SMART_TRUNCATE_MIN_LINES) return input

  const head = lines.slice(0, SMART_TRUNCATE_HEAD)
  const tail = lines.slice(lines.length - SMART_TRUNCATE_TAIL)
  const cut = lines.length - head.length - tail.length

  return [...head, `... +${cut} lines truncated (file continues)`, ...tail].join("\n")
}
