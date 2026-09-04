import type { LucideIcon } from "lucide-react"
import { Code, Heading, List, ListOrdered, ListTodo, Quote, Table2 } from "lucide-react"

// 模板块源码状态：未完成 / 进行中 / 已完成。
export type MarkdownTemplateStatus = "todo" | "in_progress" | "done"

// Markdown 块命令标识。
export type MarkdownBlockCommandId =
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "unorderedList"
  | "taskList"
  | "orderedList"
  | "quote"
  | "codeBlock"
  | "table"

// Markdown 块触发类型。
export type MarkdownBlockTriggerKind =
  | "heading"
  | "unorderedList"
  | "orderedList"
  | "quote"
  | "codeBlock"
  | "table"

// Markdown 块命令配置。
export interface MarkdownBlockCommand {
  id: MarkdownBlockCommandId
  label: string
  preview: string
  icon: LucideIcon
}

// Markdown 块触发范围。
export interface MarkdownBlockTrigger {
  from: number
  to: number
  kind: MarkdownBlockTriggerKind
}

// Markdown 块命令插入内容。
export interface MarkdownBlockInsertion {
  text: string
  selectionStart: number
  selectionEnd: number
}

const headingCommands: MarkdownBlockCommand[] = Array.from({ length: 6 }, (_, index) => ({
  id: `heading${index + 1}` as MarkdownBlockCommandId,
  label: `${index + 1} 级标题`,
  preview: `${"#".repeat(index + 1)} Heading`,
  icon: Heading,
}))

const commandsByTrigger: Record<MarkdownBlockTriggerKind, MarkdownBlockCommand[]> = {
  heading: headingCommands,
  unorderedList: [
    { id: "unorderedList", label: "无序列表", preview: "- Item", icon: List },
    { id: "taskList", label: "任务列表", preview: "- [ ] Task", icon: ListTodo },
  ],
  orderedList: [{ id: "orderedList", label: "有序列表", preview: "1. Item", icon: ListOrdered }],
  quote: [{ id: "quote", label: "引用", preview: "> Quote", icon: Quote }],
  codeBlock: [{ id: "codeBlock", label: "代码块", preview: "```language", icon: Code }],
  table: [{ id: "table", label: "表格", preview: "| Header |", icon: Table2 }],
}

/**
 * 解析光标所在行的 Markdown 块触发标记。
 */
export const getMarkdownBlockTrigger = (
  lineText: string,
  lineFrom: number,
  cursor: number,
): MarkdownBlockTrigger | null => {
  const cursorOffset = cursor - lineFrom
  if (cursorOffset !== lineText.length) return null

  const matches: [MarkdownBlockTriggerKind, RegExp][] = [
    ["heading", /^(\s*)#{1,6}\s?$/],
    ["unorderedList", /^(\s*)[-+*]\s?$/],
    ["orderedList", /^(\s*)1[.)]\s?$/],
    ["quote", /^(\s*)>\s?$/],
    ["codeBlock", /^(\s*)(?:`{3,}|~{3,})$/],
    ["table", /^(\s*)\|$/],
  ]

  for (const [kind, pattern] of matches) {
    const match = lineText.match(pattern)
    if (match) {
      return { kind, from: lineFrom + match[1].length, to: cursor }
    }
  }

  return null
}

/**
 * 判断指定文本末尾是否处于未闭合的 Markdown 代码围栏内。
 */
export const isInsideMarkdownCodeFence = (text: string): boolean => {
  let openingFence: string | null = null

  for (const line of text.split("\n")) {
    const match = line.match(/^\s*(`{3,}|~{3,})/)
    if (!match) continue

    const marker = match[1]
    if (!openingFence) {
      openingFence = marker
      continue
    }

    if (marker[0] === openingFence[0] && marker.length >= openingFence.length) {
      openingFence = null
    }
  }

  return openingFence !== null
}

// 模板块状态标记（源码中的后缀文本）。
export const MARKDOWN_TEMPLATE_STATUS_SUFFIX: Record<
  Exclude<MarkdownTemplateStatus, "todo">,
  string
> = {
  done: " done",
  in_progress: " in_progress",
}

// 模板块开始行：&&& command [「title: 标题」]；done/in_progress/supple/suppleTemplate/log/logTemplate 为状态/子块保留词，{id:/{wt: 为结束行元数据。
const MARKDOWN_TEMPLATE_START_RE =
  /^\s*&&&\s+(?!done\b|in_progress\b|supple\b|suppleTemplate\b|log\b|logTemplate\b|\{id:|\{wt:)/

// 模板块 id：uuid 去连字符后的 32 位小写十六进制，源码格式 {id:xxxxxxxx...}。
const MARKDOWN_TEMPLATE_ID_RE = /\{id:([0-9a-f]{32})\}/

// 模板块 git 工作区绑定分支：源码格式 {wt:分支名}，分支名不含空白、} 或 {。
const MARKDOWN_TEMPLATE_WT_RE = /\{wt:([^}\s{]+)\}/

// 模板块结束行：&&& [状态标记] [{id:...}] [{wt:...}]。
const MARKDOWN_TEMPLATE_END_RE =
  /^\s*&&&(?:\s+(?:done|in_progress))?(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$/

// 模板块结束行解析：捕获缩进、&&&、状态标记、id 与 wt。
const MARKDOWN_TEMPLATE_END_PARSE_RE =
  /^(\s*)(&&&)(?:\s+(done|in_progress))?(?:\s+\{id:([0-9a-f]{32})\})?(?:\s+\{wt:([^}\s{]+)\})?\s*$/

// 模板块状态标记后缀（供 exec 捕获），状态后可能紧跟 id/wt。
const MARKDOWN_TEMPLATE_STATUS_CAPTURE_RE =
  /\s+(done|in_progress)(?=\s+\{id:[0-9a-f]{32}\}(?:\s+\{wt:[^}\s{]+\})?\s*$|(?:\s+\{wt:[^}\s{]+\})?\s*$)/

// 模板块注释行：// 开头（允许前置缩进）。
export const MARKDOWN_TEMPLATE_COMMENT_RE = /^\s*\/\//

// supple 补充块开始行：+++ suppleTemplate --start 或 +++ supple --start。
export const MARKDOWN_SUPPLE_START_RE = /^\s*\+\+\+\s+(?:suppleTemplate|supple)\s+--start\s*$/

// log 补充块开始行：+++ logTemplate --start 或 +++ log --start。
export const MARKDOWN_LOG_START_RE = /^\s*\+\+\+\s+(?:logTemplate|log)\s+--start\s*$/

// supple 补充块结束行：+++ suppleTemplate --end 或 +++ supple --end。
export const MARKDOWN_SUPPLE_END_RE = /^\s*\+\+\+\s+(?:suppleTemplate|supple)\s+--end\s*$/

// log 补充块结束行：+++ logTemplate --end 或 +++ log --end。
export const MARKDOWN_LOG_END_RE = /^\s*\+\+\+\s+(?:logTemplate|log)\s+--end\s*$/

/**
 * 判断指定文本末尾是否处于未闭合的 log 日志块内。
 */
export const isInsideMarkdownLogBlock = (text: string): boolean => {
  let isOpen = false

  for (const line of text.split("\n")) {
    if (isOpen) {
      if (MARKDOWN_LOG_END_RE.test(line)) {
        isOpen = false
      }
    } else if (MARKDOWN_LOG_START_RE.test(line)) {
      isOpen = true
    }
  }

  return isOpen
}

/**
 * 判断指定文本末尾是否处于未闭合的 supple 补充块内。
 */
export const isInsideMarkdownSuppleBlock = (text: string): boolean => {
  let isOpen = false

  for (const line of text.split("\n")) {
    if (isOpen) {
      if (MARKDOWN_SUPPLE_END_RE.test(line)) {
        isOpen = false
      }
    } else if (MARKDOWN_SUPPLE_START_RE.test(line)) {
      isOpen = true
    }
  }

  return isOpen
}

/**
 * 判断指定文本末尾是否处于未闭合的模板块内。
 */
export const isInsideMarkdownTemplateBlock = (text: string): boolean => {
  let isOpen = false

  for (const line of text.split("\n")) {
    if (MARKDOWN_TEMPLATE_END_RE.test(line)) {
      isOpen = false
    } else if (MARKDOWN_TEMPLATE_START_RE.test(line)) {
      isOpen = true
    }
  }

  return isOpen
}

/**
 * 切换文本中每一行的模板块注释状态：所有非空行均为注释时统一解除注释，
 * 否则为所有非空行在原有缩进后添加 //。空行保持原样。
 */
export const toggleMarkdownTemplateCommentLines = (text: string): string => {
  const lines = text.split("\n")
  const contentLines = lines.filter((line) => line.trim() !== "")
  const allCommented =
    contentLines.length > 0 && contentLines.every((line) => MARKDOWN_TEMPLATE_COMMENT_RE.test(line))

  return lines
    .map((line) => {
      if (line.trim() === "") return line
      if (allCommented) {
        return line.replace(/^(\s*)\/\/\s?/, "$1")
      }
      const indentMatch = line.match(/^(\s*)/)
      return `${indentMatch?.[1] ?? ""}// ${line.trimStart()}`
    })
    .join("\n")
}

/**
 * 判断一行是否为模板块开始标记（&&& <command> [「title:...」]）。
 */
export const isMarkdownTemplateStartLine = (line: string): boolean =>
  MARKDOWN_TEMPLATE_START_RE.test(line)

/**
 * 判断一行是否为模板块结束标记（&&& [done|in_progress] [{id:...}] [{wt:...}]）。
 */
export const isMarkdownTemplateEndLine = (line: string): boolean =>
  MARKDOWN_TEMPLATE_END_RE.test(line)

/**
 * 判断一行是否为 supple 补充块开始标记（+++ suppleTemplate --start 或 +++ supple --start）。
 */
export const isMarkdownSuppleStartLine = (line: string): boolean =>
  MARKDOWN_SUPPLE_START_RE.test(line)

/**
 * 判断一行是否为 supple 补充块结束标记（+++ suppleTemplate --end 或 +++ supple --end）。
 */
export const isMarkdownSuppleEndLine = (line: string): boolean => MARKDOWN_SUPPLE_END_RE.test(line)

/**
 * 判断一行是否为 log 补充块开始标记（+++ logTemplate --start 或 +++ log --start）。
 */
export const isMarkdownLogStartLine = (line: string): boolean => MARKDOWN_LOG_START_RE.test(line)

/**
 * 判断一行是否为 log 补充块结束标记（+++ logTemplate --end 或 +++ log --end）。
 */
export const isMarkdownLogEndLine = (line: string): boolean => MARKDOWN_LOG_END_RE.test(line)

/**
 * 提取文本中 position 所在模板块的正文（不含 &&& 标记行）；不在模板块内返回 null。
 * 光标位于开始行、正文或结束行自身均视为处于该块内。
 */
export const getMarkdownTemplateBlockContent = (text: string, position: number): string | null => {
  const lines = text.split("\n")
  const boundedPosition = Math.min(Math.max(position, 0), text.length)
  let activeStartOffset: number | null = null
  let activeBodyStart: number | null = null
  let currentOffset = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineStart = currentOffset
    const lineEnd = lineStart + line.length + 1

    if (isMarkdownTemplateStartLine(line)) {
      activeStartOffset = lineStart
      activeBodyStart = lineEnd
    } else if (isMarkdownTemplateEndLine(line)) {
      if (activeStartOffset !== null && activeBodyStart !== null) {
        if (boundedPosition >= activeStartOffset && boundedPosition <= lineEnd) {
          return text.slice(activeBodyStart, lineStart)
        }
      }
      activeStartOffset = null
      activeBodyStart = null
    }

    currentOffset = lineEnd
  }

  if (
    activeStartOffset !== null &&
    activeBodyStart !== null &&
    boundedPosition >= activeStartOffset
  ) {
    return text.slice(activeBodyStart)
  }

  return null
}

/**
 * 返回 position 所在模板块开始行的行号（1-based）；光标位于开始行自身时返回该行；不在模板块内返回 null。
 */
export const getMarkdownTemplateBlockStartLine = (
  text: string,
  position: number,
): number | null => {
  const lines = text.split("\n")
  const boundedPosition = Math.min(Math.max(position, 0), text.length)
  let offset = 0
  let startLine: number | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const lineStart = offset
    const lineEnd = offset + lines[index].length + 1
    if (isMarkdownTemplateStartLine(lines[index])) startLine = index + 1
    if (boundedPosition >= lineStart && boundedPosition < lineEnd) return startLine
    if (isMarkdownTemplateEndLine(lines[index])) startLine = null
    offset = lineEnd
  }

  return startLine
}

/**
 * 返回 position 所在模板块结束行的行号（1-based）；不在模板块内或块未闭合返回 null。
 * 光标位于开始行、正文或结束行自身均返回所属块的结束行。
 */
export const getMarkdownTemplateBlockEndLine = (text: string, position: number): number | null => {
  const lines = text.split("\n")
  const boundedPosition = Math.min(Math.max(position, 0), text.length)
  let offset = 0
  let startOffset: number | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const lineStart = offset
    const lineContentEnd = lineStart + lines[index].length
    const lineEnd = lineContentEnd + 1

    if (isMarkdownTemplateStartLine(lines[index])) {
      startOffset = lineStart
    } else if (isMarkdownTemplateEndLine(lines[index])) {
      if (startOffset !== null && boundedPosition >= startOffset && boundedPosition <= lineEnd) {
        return index + 1
      }
      startOffset = null
    }

    offset = lineEnd
  }

  return null
}

/**
 * 更新模板块开始行的「title: 」字段：已有则替换内容，缺失则在行尾补插。
 * 标题内不允许出现「」字符，否则会截断「title:...」字段解析。
 */
export const setMarkdownTemplateTitle = (startText: string, title: string): string => {
  const safeTitle = title.replace(/[「」]/g, "").trim()
  const replacement = `「title: ${safeTitle}」`
  return /「title:[^」\n]*」/.test(startText)
    ? startText.replace(/「title:[^」\n]*」/, replacement)
    : `${startText.trimEnd()} ${replacement}`
}

/**
 * 解析模板块结束行的源码状态；非结束行返回 null。
 */
export const getMarkdownTemplateStatus = (lineText: string): MarkdownTemplateStatus | null => {
  const match = MARKDOWN_TEMPLATE_END_PARSE_RE.exec(lineText)
  if (!match) return null

  return (match[3] as MarkdownTemplateStatus | undefined) ?? "todo"
}

/**
 * 循环切换模板块结束行状态（未完成 -> 进行中 -> 已完成 -> 未完成）；非结束行返回 null。
 * 保留 id 与 wt（工作区绑定）标记不变。
 */
export const cycleMarkdownTemplateStatus = (lineText: string): string | null => {
  const match = MARKDOWN_TEMPLATE_END_PARSE_RE.exec(lineText)
  if (!match) return null

  const current = (match[3] as MarkdownTemplateStatus | undefined) ?? "todo"
  const next: MarkdownTemplateStatus =
    current === "todo" ? "in_progress" : current === "in_progress" ? "done" : "todo"
  const id = match[4] ?? ""
  const wt = match[5] ?? ""

  return `${match[1]}${match[2]}${MARKDOWN_TEMPLATE_STATUS_SUFFIX[next] ?? ""}${id ? ` {id:${id}}` : ""}${wt ? ` {wt:${wt}}` : ""}`
}

/**
 * 读取模板块结束行的工作区绑定分支；非结束行或无绑定返回 null。
 */
export const getMarkdownTemplateWorktree = (lineText: string): string | null => {
  if (!MARKDOWN_TEMPLATE_END_RE.test(lineText)) return null
  return lineText.match(MARKDOWN_TEMPLATE_WT_RE)?.[1] ?? null
}

/**
 * 更新模板块结束行的工作区绑定：branch 为 null 时移除绑定，否则写入 {wt:branch}。
 * 保留缩进、&&&、状态标记与 id；非结束行返回原文本。
 */
export const setMarkdownTemplateWorktree = (lineText: string, branch: string | null): string => {
  const match = MARKDOWN_TEMPLATE_END_PARSE_RE.exec(lineText)
  if (!match) return lineText

  const id = match[4] ?? ""
  const wt = branch?.trim() ?? ""
  return `${match[1]}${match[2]}${MARKDOWN_TEMPLATE_STATUS_SUFFIX[match[3] as MarkdownTemplateStatus] ?? ""}${id ? ` {id:${id}}` : ""}${wt ? ` {wt:${wt}}` : ""}`
}

/**
 * 生成模板块 id：uuid 去除连字符后的 32 位小写十六进制，源码格式 {id:xxxxxxxx...}。
 */
export const createMarkdownTemplateId = (): string => crypto.randomUUID().replaceAll("-", "")

/**
 * 扫描文本中全部模板块结束行上的 id 源码范围，供编辑器只读保护使用。
 */
export const getMarkdownTemplateIdRanges = (text: string): { from: number; to: number }[] => {
  const ranges: { from: number; to: number }[] = []
  let offset = 0

  for (const line of text.split("\n")) {
    if (MARKDOWN_TEMPLATE_END_RE.test(line)) {
      const idMatch = line.match(MARKDOWN_TEMPLATE_ID_RE)
      if (idMatch?.index !== undefined) {
        ranges.push({
          from: offset + idMatch.index,
          to: offset + idMatch.index + idMatch[0].length,
        })
      }
    }
    offset += line.length + 1
  }

  return ranges
}

/**
 * 扫描文本中全部模板块结束行上的 wt（工作区绑定）源码范围，供编辑器只读保护使用。
 */
export const getMarkdownTemplateWtRanges = (text: string): { from: number; to: number }[] => {
  const ranges: { from: number; to: number }[] = []
  let offset = 0

  for (const line of text.split("\n")) {
    if (MARKDOWN_TEMPLATE_END_RE.test(line)) {
      const wtMatch = line.match(MARKDOWN_TEMPLATE_WT_RE)
      if (wtMatch?.index !== undefined) {
        ranges.push({
          from: offset + wtMatch.index,
          to: offset + wtMatch.index + wtMatch[0].length,
        })
      }
    }
    offset += line.length + 1
  }

  return ranges
}

/**
 * 扫描内容中全部模板块的结束状态；未闭合模板块不计入。
 */
export const getMarkdownTemplateStatuses = (content: string): MarkdownTemplateStatus[] => {
  const statuses: MarkdownTemplateStatus[] = []
  let isOpen = false

  for (const line of content.split("\n")) {
    if (MARKDOWN_TEMPLATE_END_RE.test(line)) {
      const status = line.match(MARKDOWN_TEMPLATE_STATUS_CAPTURE_RE)?.[1] as
        | MarkdownTemplateStatus
        | undefined
      if (isOpen) statuses.push(status ?? "todo")
      isOpen = false
    } else if (MARKDOWN_TEMPLATE_START_RE.test(line)) {
      isOpen = true
    }
  }

  return statuses
}

/**
 * 获取匹配触发标记时可用的 Markdown 块命令。
 */
export const getMarkdownBlockCommands = (kind: MarkdownBlockTriggerKind): MarkdownBlockCommand[] =>
  commandsByTrigger[kind]

/**
 * 创建块命令替换触发标记所需的文本和选区。
 */
export const createMarkdownBlockInsertion = (
  commandId: MarkdownBlockCommandId,
): MarkdownBlockInsertion => {
  if (commandId.startsWith("heading")) {
    const level = Number(commandId.at(-1))
    const text = `${"#".repeat(level)} Heading`
    return { text, selectionStart: level + 1, selectionEnd: text.length }
  }

  switch (commandId) {
    case "unorderedList":
      return { text: "- item", selectionStart: 2, selectionEnd: 6 }
    case "taskList":
      return { text: "- [ ] task", selectionStart: 6, selectionEnd: 10 }
    case "orderedList":
      return { text: "1. item", selectionStart: 3, selectionEnd: 7 }
    case "quote":
      return { text: "> quote", selectionStart: 2, selectionEnd: 7 }
    case "codeBlock":
      return { text: "```language\n```", selectionStart: 3, selectionEnd: 11 }
    case "table": {
      const text = "| Header | Header |\n| --- | --- |\n| content | content |\n|  |  |"
      return { text, selectionStart: 2, selectionEnd: 8 }
    }
    default:
      throw new Error(`Unsupported Markdown block command: ${commandId}`)
  }
}

// 模板块状态英文文案。
export const MARKDOWN_TEMPLATE_STATUS_LABELS: Record<MarkdownTemplateStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
}
