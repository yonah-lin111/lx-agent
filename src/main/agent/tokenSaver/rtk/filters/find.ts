// find 输出按目录分组并限流。
import { FIND_PER_DIR_MAX, FIND_TOTAL_DIR_MAX } from "../constants"

// 压缩 find 输出：按父目录分组展示文件名，每目录与总目录数均有上限。
export const find = (input: string): string => {
  const lines = input.split("\n").filter((line) => line.trim())
  if (lines.length === 0) return input

  const byDir = new Map<string, string[]>()

  for (const path of lines) {
    // 同时兼容 Unix（"/a/b"）与 Windows（"C:\\a\\b"）路径分隔符。
    const lastSep = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
    let dir: string
    let basename: string
    if (lastSep === -1) {
      dir = "."
      basename = path
    } else {
      dir = path.slice(0, lastSep) || "/"
      basename = path.slice(lastSep + 1)
    }
    const files = byDir.get(dir)
    if (files) {
      files.push(basename)
    } else {
      byDir.set(dir, [basename])
    }
  }

  const dirs = Array.from(byDir.keys()).sort()
  let out = `${lines.length} files in ${dirs.length} dirs:\n\n`

  for (const dir of dirs.slice(0, FIND_TOTAL_DIR_MAX)) {
    const files = byDir.get(dir) ?? []
    const dirLabel = dir.replace(/\\/g, "/")
    out += `${dirLabel}/  (${files.length})\n`
    for (const file of files.slice(0, FIND_PER_DIR_MAX)) out += `  ${file}\n`
    if (files.length > FIND_PER_DIR_MAX) {
      out += `  +${files.length - FIND_PER_DIR_MAX}\n`
    }
  }
  if (dirs.length > FIND_TOTAL_DIR_MAX) {
    out += `\n+${dirs.length - FIND_TOTAL_DIR_MAX} more dirs\n`
  }

  return out
}
