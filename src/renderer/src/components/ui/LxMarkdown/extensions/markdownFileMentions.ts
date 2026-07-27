// 文件提及 token 匹配表达式。
const FILE_MENTION_PATTERN = /(^|\s)(@[^\s]+)(?=$|\s)/g

// 文件提及删除范围。
export type FileMentionDeletionRange = { start: number; end: number }

/**
 * 计算 @ 文件提及需要整块删除的范围。
 */
export const getFileMentionDeletionRange = (
  value: string,
  cursor: number,
): FileMentionDeletionRange | null => {
  const ranges: FileMentionDeletionRange[] = []
  FILE_MENTION_PATTERN.lastIndex = 0

  let match = FILE_MENTION_PATTERN.exec(value)
  while (match) {
    const prefix = match[1] ?? ""
    const token = match[2] ?? ""
    const start = match.index + prefix.length
    ranges.push({ start, end: start + token.length })
    match = FILE_MENTION_PATTERN.exec(value)
  }

  if (ranges.some((range) => range.end === cursor)) return null

  if (/[ \t]/.test(value[cursor - 1] ?? "")) {
    let index = cursor - 1
    while (index >= 0 && /[ \t]/.test(value[index])) index -= 1

    const range = ranges.find((item) => item.end === index + 1)
    if (range) return { start: range.start, end: cursor }
  }

  return null
}
