// grep 输出按文件分组并限流。
import { GREP_PER_FILE_MAX } from "../constants"

// 压缩 grep 输出（"file:line:content"）：按文件分组，每文件最多保留 10 条。
export const grep = (input: string): string => {
  const byFile = new Map<string, Array<[string, string]>>()
  let total = 0

  for (const line of input.split("\n")) {
    const first = line.indexOf(":")
    if (first === -1) continue
    const second = line.indexOf(":", first + 1)
    if (second === -1) continue
    const file = line.slice(0, first)
    const lineNumStr = line.slice(first + 1, second)
    const content = line.slice(second + 1)
    if (!/^\d+$/.test(lineNumStr)) continue
    total++
    const matches = byFile.get(file)
    if (matches) {
      matches.push([lineNumStr, content])
    } else {
      byFile.set(file, [[lineNumStr, content]])
    }
  }

  if (total === 0) return input

  const files = Array.from(byFile.keys()).sort()
  let out = `${total} matches in ${files.length}F:\n\n`

  for (const file of files) {
    const matches = byFile.get(file) ?? []
    out += `[file] ${file} (${matches.length}):\n`
    for (const [lineNum, content] of matches.slice(0, GREP_PER_FILE_MAX)) {
      out += `  ${lineNum.padStart(4)}: ${content.trim()}\n`
    }
    if (matches.length > GREP_PER_FILE_MAX) {
      out += `  +${matches.length - GREP_PER_FILE_MAX}\n`
    }
    out += "\n"
  }

  return out
}
