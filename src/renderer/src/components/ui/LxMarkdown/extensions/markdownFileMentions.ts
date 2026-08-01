// 文件路径提及必须以 ASCII 字母、数字或下划线开头，只允许常见路径字符。
export const MARKDOWN_FILE_MENTION_PATH_PATTERN = String.raw`[A-Za-z0-9_][A-Za-z0-9_.\/\\-]*`

// 文件提及后的常见标点作为 token 边界，不参与提及高亮。
const MARKDOWN_FILE_MENTION_BOUNDARY_PATTERN = String.raw`(?=$|[\s.,;:!?，。；：！？、…()[\]{}])`

// 编辑器和预览共用的普通文件提及匹配表达式。
export const MARKDOWN_FILE_MENTION_PATTERN = new RegExp(
  String.raw`(?<![\w\[])@(${MARKDOWN_FILE_MENTION_PATH_PATTERN})${MARKDOWN_FILE_MENTION_BOUNDARY_PATTERN}`,
  "gu",
)

// 文件提及和 Markdown 引用 token 匹配表达式。
const FILE_MENTION_PATTERN = new RegExp(
  String.raw`(^|\s)(@\[refer-(?:project|folder|file|image|common)\]\((?:[^()\r\n]|\([^()\r\n]*\))+\)|@${MARKDOWN_FILE_MENTION_PATH_PATTERN})(?=$|\s)`,
  "gu",
)

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

  MARKDOWN_FILE_MENTION_PATTERN.lastIndex = 0
  let fileMentionMatch = MARKDOWN_FILE_MENTION_PATTERN.exec(value)
  while (fileMentionMatch) {
    const start = fileMentionMatch.index
    ranges.push({ start, end: start + fileMentionMatch[0].length })
    fileMentionMatch = MARKDOWN_FILE_MENTION_PATTERN.exec(value)
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
