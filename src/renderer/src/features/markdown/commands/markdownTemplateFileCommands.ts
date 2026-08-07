import { getMarkdownReferenceName } from "@/features/markdown/commands/markdownReferenceCommands"
import {
  isPathUnderReferencedRoots,
  MARKDOWN_FILE_MENTION_PATTERN,
} from "@/features/markdown/extensions/markdownFileMentions"

// 模板块文件快捷输入片段：必须为非 @ 开头、仅含常见路径字符，且前一个字符是边界。
const MARKDOWN_TEMPLATE_FILE_TRIGGER_RE =
  /(^|[^A-Za-z0-9_@.\/\\-])([A-Za-z0-9_][A-Za-z0-9_.\/\\-]*)$/

// 最小片段长度，避免单字符弹出噪音。
const MARKDOWN_TEMPLATE_FILE_MIN_QUERY_LENGTH = 2

// 图片扩展名：模板块文件快捷输入排除图片。
const MARKDOWN_TEMPLATE_IMAGE_EXTENSION_PATTERN = /\.(avif|gif|jpe?g|png|svg|webp)$/i

// 模板块内文件/文件夹引用：@[refer-file/folder/project](path)。
const MARKDOWN_TEMPLATE_FILE_REFERENCE_RE =
  /@\[(refer-(?:file|folder|project))\]\(((?:[^()\r\n]|\([^()\r\n]*\))+)\)/g

// 模板块文件快捷输入的片段范围。
export interface MarkdownTemplateFileTrigger {
  fragment: string
  start: number
}

// 模板块文件快捷输入候选的来源类型：@ 提及（当前项目 / 引用文件夹）、引用文件、引用文件夹。
export type MarkdownTemplateFileKind =
  | "currentMention" // 当前项目的 @ 提及
  | "referenceMention" // 引用文件夹下的 @ 提及
  | "referFile" // @[refer-file] 引用文件
  | "referFolder" // @[refer-folder] / @[refer-project] 引用文件夹

// 模板块文件快捷输入的候选：来自当前模板块内已出现的引用。
export interface MarkdownTemplateFileCandidate {
  path: string
  isDirectory: boolean
  kind: MarkdownTemplateFileKind
}

/**
 * 解析光标前文本末尾的裸片段，作为模板块文件快捷输入触发；@ 前缀不触发。
 */
export const getMarkdownTemplateFileTrigger = (
  prefix: string,
): MarkdownTemplateFileTrigger | null => {
  const match = MARKDOWN_TEMPLATE_FILE_TRIGGER_RE.exec(prefix)
  if (!match) return null

  const fragment = match[2] ?? ""
  if (fragment.length < MARKDOWN_TEMPLATE_FILE_MIN_QUERY_LENGTH) return null

  return { fragment, start: prefix.length - fragment.length }
}

/**
 * 判断路径是否为图片；文件夹不算图片。
 */
export const isMarkdownTemplateImagePath = (path: string): boolean =>
  MARKDOWN_TEMPLATE_IMAGE_EXTENSION_PATTERN.test(path)

/**
 * 收集模板块正文中已出现的文件引用候选：@ 文件提及、@[refer-file] 引用文件、
 * @[refer-folder]/@[refer-project] 引用文件夹；按路径与来源去重并排除图片。
 * @ 提及的归属按引用根判断：绝对路径且位于任一引用根下视为引用文件夹的 @ 提及。
 */
export const getMarkdownTemplateFileCandidates = (
  content: string,
  referencedRoots: readonly string[] = [],
): MarkdownTemplateFileCandidate[] => {
  const candidates: MarkdownTemplateFileCandidate[] = []
  const seen = new Set<string>()
  const roots = new Set(referencedRoots)

  const addCandidate = (path: string, kind: MarkdownTemplateFileKind): void => {
    if (!path) return
    if (kind !== "referFolder" && isMarkdownTemplateImagePath(path)) return
    const key = `${kind}:${path}`
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({ path, isDirectory: kind === "referFolder", kind })
  }

  for (const match of content.matchAll(MARKDOWN_TEMPLATE_FILE_REFERENCE_RE)) {
    const type = match[1]
    const path = match[2] ?? ""
    addCandidate(path, type === "refer-file" ? "referFile" : "referFolder")
  }

  for (const match of content.matchAll(MARKDOWN_FILE_MENTION_PATTERN)) {
    const mention = (match[0] ?? "").replace(/^@/, "")
    // @ 提及无法从文本判断目录性，按文件处理；是否位于引用根下决定归属。
    addCandidate(
      mention,
      isPathUnderReferencedRoots(match[0] ?? "", roots) ? "referenceMention" : "currentMention",
    )
  }

  return candidates
}

/**
 * 判断查询是否为候选名的子序列（不要求连续）。
 */
const isSubsequence = (query: string, value: string): boolean => {
  let queryIndex = 0
  for (const char of value) {
    if (char === query[queryIndex]) queryIndex += 1
    if (queryIndex === query.length) return true
  }
  return queryIndex === query.length
}

/**
 * 按片段过滤候选：名称优先于路径，子序列兜底，返回保持原相对顺序的匹配结果。
 */
export const filterMarkdownTemplateFileCandidates = (
  candidates: readonly MarkdownTemplateFileCandidate[],
  query: string,
): MarkdownTemplateFileCandidate[] => {
  const cleanQuery = query.trim().toLowerCase()
  if (cleanQuery.length === 0) return [...candidates]

  return candidates
    .map((candidate) => {
      const name = getMarkdownReferenceName(candidate.path).toLowerCase()
      const path = candidate.path.toLowerCase()
      let score = 0
      if (name === cleanQuery) score = 100
      else if (name.startsWith(cleanQuery)) score = 90
      else if (path.startsWith(cleanQuery)) score = 80
      else if (name.includes(cleanQuery)) score = 60
      else if (isSubsequence(cleanQuery, name)) score = 40
      else if (path.includes(cleanQuery)) score = 20
      return { candidate, score }
    })
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score)
    .map((item) => item.candidate)
}

/**
 * 创建模板块文件快捷引用的插入文本：文件用 basename，文件夹带斜杠。
 */
export const createMarkdownTemplateFileReference = (file: {
  path: string
  isDirectory: boolean
}): string => `【${getMarkdownReferenceName(file.path)}${file.isDirectory ? "/" : ""}】`
