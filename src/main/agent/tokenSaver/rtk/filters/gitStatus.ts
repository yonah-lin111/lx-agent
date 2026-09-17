// git status 压缩为分支 + 分类计数。
import { STATUS_MAX_FILES, STATUS_MAX_UNTRACKED } from "../constants"

// 压缩 git status（长格式或 porcelain）：输出分支与暂存/修改/未跟踪统计。
export const gitStatus = (input: string): string => {
  const lines = input.split("\n")
  if (lines.length === 0 || (lines.length === 1 && !(lines[0] ?? "").trim())) {
    return "Clean working tree"
  }

  let branch = ""
  const stagedFiles: string[] = []
  const modifiedFiles: string[] = []
  const untrackedFiles: string[] = []
  let staged = 0
  let modified = 0
  let untracked = 0
  let conflicts = 0

  for (const raw of lines) {
    if (!raw.trim()) continue

    // 长格式分支行（LLM 常回传这种而不是 porcelain）。
    const longBranch = raw.match(/^On branch (\S+)/)
    if (longBranch?.[1]) {
      branch = longBranch[1]
      continue
    }

    // porcelain 分支头："## main...origin/main"。
    if (raw.startsWith("##")) {
      branch = raw.replace(/^##\s*/, "")
      continue
    }

    // porcelain 状态行（两字符状态 + 空格 + 路径）。
    if (raw.length >= 3 && /^[ MADRCU?!][ MADRCU?!] /.test(raw)) {
      const x = raw[0] ?? ""
      const y = raw[1] ?? ""
      const file = raw.slice(3)

      if (raw.slice(0, 2) === "??") {
        untracked++
        untrackedFiles.push(file)
        continue
      }

      if ("MADRC".includes(x)) {
        staged++
        stagedFiles.push(file)
      } else if (x === "U") {
        conflicts++
      }

      if (y === "M" || y === "D") {
        modified++
        modifiedFiles.push(file)
      }
      continue
    }

    // 长格式兜底（"modified:   path" / "new file:   path" 等）。
    const longMatch = raw.match(/^\s*(modified|new file|deleted|renamed|both modified):\s+(.+)$/)
    if (longMatch?.[1] && longMatch[2]) {
      const kind = longMatch[1]
      const path = longMatch[2].trim()
      if (kind === "both modified") {
        conflicts++
      } else if (kind === "modified" || kind === "deleted") {
        modified++
        modifiedFiles.push(path)
      } else if (kind === "new file" || kind === "renamed") {
        staged++
        stagedFiles.push(path)
      }
    }
  }

  let out = ""
  if (branch) out += `* ${branch}\n`

  if (staged > 0) {
    out += `+ Staged: ${staged} files\n`
    for (const f of stagedFiles.slice(0, STATUS_MAX_FILES)) out += `   ${f}\n`
    if (stagedFiles.length > STATUS_MAX_FILES) {
      out += `   ... +${stagedFiles.length - STATUS_MAX_FILES} more\n`
    }
  }

  if (modified > 0) {
    out += `~ Modified: ${modified} files\n`
    for (const f of modifiedFiles.slice(0, STATUS_MAX_FILES)) out += `   ${f}\n`
    if (modifiedFiles.length > STATUS_MAX_FILES) {
      out += `   ... +${modifiedFiles.length - STATUS_MAX_FILES} more\n`
    }
  }

  if (untracked > 0) {
    out += `? Untracked: ${untracked} files\n`
    for (const f of untrackedFiles.slice(0, STATUS_MAX_UNTRACKED)) out += `   ${f}\n`
    if (untrackedFiles.length > STATUS_MAX_UNTRACKED) {
      out += `   ... +${untrackedFiles.length - STATUS_MAX_UNTRACKED} more\n`
    }
  }

  if (conflicts > 0) {
    out += `conflicts: ${conflicts} files\n`
  }

  if (staged === 0 && modified === 0 && untracked === 0 && conflicts === 0) {
    out += "clean — nothing to commit\n"
  }

  return out.replace(/\n+$/, "")
}
