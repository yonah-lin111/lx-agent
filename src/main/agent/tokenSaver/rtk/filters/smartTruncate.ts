// 保留头尾，中部折叠。
import { SMART_TRUNCATE_HEAD, SMART_TRUNCATE_MIN_LINES, SMART_TRUNCATE_TAIL } from "../constants"

// 压缩无结构大文本：保留头 120 行与尾 60 行，其余折叠计数。
export const smartTruncate = (input: string): string => {
  const lines = input.split("\n")
  if (lines.length < SMART_TRUNCATE_MIN_LINES) return input

  const head = lines.slice(0, SMART_TRUNCATE_HEAD)
  const tail = lines.slice(lines.length - SMART_TRUNCATE_TAIL)
  const cut = lines.length - head.length - tail.length
  return [...head, `... +${cut} lines truncated`, ...tail].join("\n")
}
