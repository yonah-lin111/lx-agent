// ls -la 输出压缩为紧凑列表 + 摘要。
import { LS_EXT_SUMMARY_TOP, LS_NOISE_DIRS } from "../constants"

// ls 日期列：月 + 日 + (年 | 时:分)。
const LS_DATE_RE =
  /\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+(\d{4}|\d{2}:\d{2})\s+/

// 人类可读文件大小。
const humanSize = (bytes: number): string => {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)}M`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}K`
  return `${bytes}B`
}

// 解析单行 ls -la 输出。
const parseLsLine = (line: string): { fileType: string; size: number; name: string } | null => {
  const match = LS_DATE_RE.exec(line)
  if (!match) return null
  const name = line.slice(match.index + match[0].length)
  const beforeParts = (line.slice(0, match.index) || "").split(/\s+/).filter(Boolean)
  if (beforeParts.length < 4) return null

  const perms = beforeParts[0] ?? ""
  const fileType = perms.charAt(0)

  // 大小取日期列前最右侧可解析数字。
  let size = 0
  for (let i = beforeParts.length - 1; i >= 0; i--) {
    const value = beforeParts[i] ?? ""
    const parsed = Number(value)
    if (Number.isInteger(parsed) && String(parsed) === value) {
      size = parsed
      break
    }
  }
  return { fileType, size, name }
}

// 压缩 ls -la 输出：目录与文件紧凑列出，噪声目录忽略，结尾附扩展名摘要。
export const ls = (input: string): string => {
  const dirs: string[] = []
  const files: Array<[string, string]> = []
  const byExt = new Map<string, number>()

  for (const line of input.split("\n")) {
    if (line.startsWith("total ") || line.length === 0) continue
    const parsed = parseLsLine(line)
    if (!parsed) continue
    if (parsed.name === "." || parsed.name === "..") continue
    if (LS_NOISE_DIRS.includes(parsed.name)) continue

    if (parsed.fileType === "d") {
      dirs.push(parsed.name)
    } else if (parsed.fileType === "-" || parsed.fileType === "l") {
      const dot = parsed.name.lastIndexOf(".")
      const ext = dot > 0 ? parsed.name.slice(dot) : "no ext"
      byExt.set(ext, (byExt.get(ext) ?? 0) + 1)
      files.push([parsed.name, humanSize(parsed.size)])
    }
  }

  if (dirs.length === 0 && files.length === 0) return input

  let out = ""
  for (const dir of dirs) out += `${dir}/\n`
  for (const [name, size] of files) out += `${name}  ${size}\n`

  let summary = `\nSummary: ${files.length} files, ${dirs.length} dirs`
  if (byExt.size > 0) {
    const ext = Array.from(byExt.entries()).sort((a, b) => b[1] - a[1])
    const parts = ext.slice(0, LS_EXT_SUMMARY_TOP).map(([name, count]) => `${count} ${name}`)
    summary += ` (${parts.join(", ")}`
    if (ext.length > LS_EXT_SUMMARY_TOP) {
      summary += `, +${ext.length - LS_EXT_SUMMARY_TOP} more`
    }
    summary += ")"
  }

  return out + summary
}
