// 文件提及和 Markdown 引用 token 匹配表达式。
const FILE_MENTION_PATTERN =
  /(^|\s)(@\[refer-(?:project|folder|file|image|common)\]\((?:[^()\r\n]|\([^()\r\n]*\))+\)|@[^\s]+)(?=$|\s)/g

// 文件提及删除范围。
export type FileMentionDeletionRange = { start: number; end: number }

/**
 * 获取文件提及在预览时的缩略显示名称：
 * 当前项目显示【@父文件夹名称/文件名】；
 * 引用项目显示【@引用项目名称/.../@父文件夹名称/文件名】。
 */
export const getFileMentionDisplayLabel = (
  rawPath: string,
  referencedProjectNames?: Set<string>,
): string => {
  const cleanPath = rawPath.replace(/^@/, "")
  const parts = cleanPath.split(/[/\\]+/).filter(Boolean)

  if (parts.length === 0) return `@${cleanPath}`

  const firstPart = parts[0]
  const isReferencedProject = referencedProjectNames?.has(firstPart) ?? false

  if (isReferencedProject && parts.length >= 2) {
    const projectName = firstPart
    if (parts.length >= 3) {
      const parentFolder = parts[parts.length - 2]
      const fileName = parts[parts.length - 1]
      return `@${projectName}/.../@${parentFolder}/${fileName}`
    }
    const fileName = parts[1]
    return `@${projectName}/.../${fileName}`
  }

  if (parts.length >= 2) {
    const parentFolder = parts[parts.length - 2]
    const fileName = parts[parts.length - 1]
    return `@${parentFolder}/${fileName}`
  }

  return `@${parts[0]}`
}

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
