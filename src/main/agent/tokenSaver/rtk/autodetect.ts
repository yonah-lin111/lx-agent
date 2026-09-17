// 自动探测过滤器：按输出特征选择过滤器。
// 探测顺序：git-log → git-diff → git-status → build-output → grep → find → tree → ls
//          → search-list → read-numbered → dedup-log → smart-truncate → null。
import {
  DETECT_WINDOW,
  READ_NUMBERED_MIN_HIT_RATIO,
  RTK_FILTER_NAMES,
  type RtkFilterName,
  SMART_TRUNCATE_MIN_LINES,
} from "./constants"
import { READ_NUMBERED_LINE_RE } from "./filters/readNumbered"
import { SEARCH_LIST_HEADER_RE } from "./filters/searchList"

const RE_GIT_DIFF = /^diff --git /m
const RE_GIT_DIFF_HUNK = /^@@ /m
const RE_GIT_STATUS = /^On branch |^nothing to commit|^Changes (not |to be )|^Untracked files:/m
const RE_GIT_LOG = /^[*|/\\ ]*commit [0-9a-f]{7,40}$/m
const RE_PORCELAIN = /^[ MADRCU?!][ MADRCU?!] \S/m
const RE_BUILD_OUTPUT =
  /^(npm (warn|error|ERR!)|yarn (warn|error)|\s*Compiling\s+\S+|\s*Downloading\s+\S+|added \d+ package|\[ERROR\]|BUILD (SUCCESS|FAILED)|\s*Finished\s+|Successfully (installed|built)|ERROR:)/im
const RE_TREE_GLYPH = /[├└]──|│  /
const RE_LS_ROW = /^[-dlbcps][rwx-]{9}/m
const RE_LS_TOTAL = /^total \d+$/m

// grep 行格式："file:line:content"。
const isGrepLine = (line: string): boolean => {
  const first = line.indexOf(":")
  if (first === -1) return false
  const second = line.indexOf(":", first + 1)
  if (second === -1) return false
  return /^\d+$/.test(line.slice(first + 1, second))
}

// 类路径行判定（Windows 盘符路径与相对/绝对路径）。
const isPathLike = (line: string): boolean => {
  const trimmed = line.trim()
  if (trimmed.length === 0) return false
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return true
  if (trimmed.includes(":")) return false
  return trimmed.startsWith(".") || trimmed.startsWith("/") || trimmed.includes("/")
}

// porcelain 行占比是否超过 60%。
const isMostlyPorcelain = (head: string): boolean => {
  const lines = head.split("\n").filter((line) => line.trim())
  if (lines.length < 3) return false
  const hits = lines.filter((line) => RE_PORCELAIN.test(line)).length
  return hits / lines.length >= 0.6
}

// 带行号文件输出判定（前 100 行命中比例）。
const isLineNumbered = (lines: string[]): boolean => {
  let hits = 0
  let nonEmpty = 0
  for (const line of lines.slice(0, 100)) {
    if (line.length === 0) continue
    nonEmpty++
    if (READ_NUMBERED_LINE_RE.test(line)) hits++
  }
  if (nonEmpty < 5) return false
  return hits / nonEmpty >= READ_NUMBERED_MIN_HIT_RATIO
}

// 统计正则命中次数。
const countMatches = (text: string, regex: RegExp): number => {
  const global = new RegExp(
    regex.source,
    regex.flags.includes("g") ? regex.flags : `${regex.flags}g`,
  )
  return (text.match(global) ?? []).length
}

// 根据输出头部特征探测过滤器；无匹配返回 null。
export const detectFilter = (text: string): RtkFilterName | null => {
  const head = text.length > DETECT_WINDOW ? text.slice(0, DETECT_WINDOW) : text

  if (RE_GIT_LOG.test(head)) return RTK_FILTER_NAMES.GIT_LOG
  if (RE_GIT_DIFF.test(head) || RE_GIT_DIFF_HUNK.test(head)) return RTK_FILTER_NAMES.GIT_DIFF
  if (RE_GIT_STATUS.test(head)) return RTK_FILTER_NAMES.GIT_STATUS

  // build-output 先于 porcelain 判定：避免 cargo "Compiling" 被误判为 git-status。
  if (RE_BUILD_OUTPUT.test(head)) return RTK_FILTER_NAMES.BUILD_OUTPUT

  if (isMostlyPorcelain(head)) return RTK_FILTER_NAMES.GIT_STATUS

  const lines = head.split("\n")
  const nonEmpty = lines.filter((line) => line.trim().length > 0)

  // grep：前 5 个非空行任意一行匹配 "file:number:content"。
  if (nonEmpty.slice(0, 5).some(isGrepLine)) return RTK_FILTER_NAMES.GREP

  // find：全部非空行均类路径（不含 ":"）且不少于 3 行。
  if (nonEmpty.length >= 3 && nonEmpty.every(isPathLike)) return RTK_FILTER_NAMES.FIND

  if (RE_TREE_GLYPH.test(head)) return RTK_FILTER_NAMES.TREE

  // ls -la：含 "total N" 头或至少 3 行权限字符串开头。
  if (RE_LS_TOTAL.test(head) || countMatches(head, RE_LS_ROW) >= 3) return RTK_FILTER_NAMES.LS

  if (SEARCH_LIST_HEADER_RE.test(head)) return RTK_FILTER_NAMES.SEARCH_LIST

  // 带行号文件转储：行数足够且命中比例达标才触发。
  if (lines.length >= SMART_TRUNCATE_MIN_LINES && isLineNumbered(lines)) {
    return RTK_FILTER_NAMES.READ_NUMBERED
  }

  // 兜底：多行重复噪音走 dedup-log。
  if (nonEmpty.length >= 5) return RTK_FILTER_NAMES.DEDUP_LOG

  // 最后兜底：无结构大文本走智能截断。
  if (lines.length >= SMART_TRUNCATE_MIN_LINES) return RTK_FILTER_NAMES.SMART_TRUNCATE

  return null
}
