import type { Locale } from "@shared/settings"
import type { LucideIcon } from "lucide-react"
import { Code, Heading, List, ListOrdered, ListTodo, Quote, Table2 } from "lucide-react"
import { stripMarkdownSlashCommands } from "@/features/markdown/commands/markdownSlashCommands"
import {
  stripEmptyTemplateItems,
  stripMarkdownTemplateComments,
} from "@/features/markdown/utils/markdownRenderer"
import { en } from "@/i18n/locales/en"
import { zh } from "@/i18n/locales/zh"

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

const createCommandsByTrigger = (
  locale: Locale,
): Record<MarkdownBlockTriggerKind, MarkdownBlockCommand[]> => {
  const dict = locale === "en" ? en : zh
  const headingCommands: MarkdownBlockCommand[] = Array.from({ length: 6 }, (_, index) => ({
    id: `heading${index + 1}` as MarkdownBlockCommandId,
    label: dict.markdown.blockHeadingLevel.replace("{{level}}", String(index + 1)),
    preview: `${"#".repeat(index + 1)} Heading`,
    icon: Heading,
  }))

  return {
    heading: headingCommands,
    unorderedList: [
      {
        id: "unorderedList",
        label: dict.markdown.blockUnorderedList,
        preview: "- Item",
        icon: List,
      },
      { id: "taskList", label: dict.markdown.blockTaskList, preview: "- [ ] Task", icon: ListTodo },
    ],
    orderedList: [
      {
        id: "orderedList",
        label: dict.markdown.blockOrderedList,
        preview: "1. Item",
        icon: ListOrdered,
      },
    ],
    quote: [{ id: "quote", label: dict.markdown.blockQuote, preview: "> Quote", icon: Quote }],
    codeBlock: [
      { id: "codeBlock", label: dict.markdown.blockCodeBlock, preview: "```language", icon: Code },
    ],
    table: [{ id: "table", label: dict.markdown.blockTable, preview: "| Header |", icon: Table2 }],
  }
}

const commandsByLocale: Record<Locale, Record<MarkdownBlockTriggerKind, MarkdownBlockCommand[]>> = {
  zh: createCommandsByTrigger("zh"),
  en: createCommandsByTrigger("en"),
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

// 模板块开始行：&&& command [--start] [「title: 标题」]；done/in_progress/supple/suppleTemplate/log/logTemplate 为状态/子块保留词，{id:/{wt: 为结束行元数据。
const MARKDOWN_TEMPLATE_START_RE =
  /^\s*&&&\s+(?!done\b|in_progress\b|supple\b|suppleTemplate\b|log\b|logTemplate\b|\{id:|\{wt:)(?:[A-Za-z]\w*)(?:\s+--start)?(?:\s+「title:[^」\n]*」)?\s*$/

// 模板块 id：uuid 去连字符后的 32 位小写十六进制，源码格式 {id:xxxxxxxx...}。
const MARKDOWN_TEMPLATE_ID_RE = /\{id:([0-9a-f]{32})\}/

// 模板块 git 工作区绑定分支：源码格式 {wt:分支名}，分支名不含空白、} 或 {。
const MARKDOWN_TEMPLATE_WT_RE = /\{wt:([^}\s{]+)\}/

// 模板块结束行：&&& [command --end] [状态标记] [{id:...}] [{wt:...}] 或旧格式 &&& [状态标记] [{id:...}] [{wt:...}]。
// 注意：如果带有 command，必须同时带有 --end 标记（例如 &&& addTemplate --end），避免将开始行（如 &&& addTemplate）误判为结束行！
const MARKDOWN_TEMPLATE_END_RE =
  /^\s*&&&(?:\s+(?:[A-Za-z]\w*)\s+--end|\s+--end)?(?:\s+(?:done|in_progress))?(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$/

interface ParsedMarkdownTemplateEnd {
  indent: string
  marker: string
  command?: string
  endFlag?: string
  status?: MarkdownTemplateStatus
  id?: string
  wt?: string
}

const parseMarkdownTemplateEndLine = (lineText: string): ParsedMarkdownTemplateEnd | null => {
  if (!MARKDOWN_TEMPLATE_END_RE.test(lineText)) return null

  const match = lineText.match(
    /^(\s*)(&&&)(?:\s+(?!\{id:|\{wt:)(.+?))?(?:\s+\{id:([0-9a-f]{32})\})?(?:\s+\{wt:([^}\s{]+)\})?\s*$/,
  )
  if (!match) return null

  const indent = match[1]
  const marker = match[2]
  const middle = match[3]?.trim() ?? ""
  const id = match[4]
  const wt = match[5]

  let command: string | undefined
  let endFlag: string | undefined
  let status: MarkdownTemplateStatus | undefined

  if (middle) {
    const tokens = middle.split(/\s+/)
    for (const token of tokens) {
      if (token === "done" || token === "in_progress") {
        status = token
      } else if (token === "--end") {
        endFlag = token
      } else if (!command && /^[A-Za-z]\w*$/.test(token)) {
        command = token
      } else {
        return null
      }
    }
  }

  // 如果有 command，必须有 --end
  if (command && !endFlag) return null

  return { indent, marker, command, endFlag, status, id, wt }
}

// 模板块注释行：// 开头（允许前置缩进）。
export const MARKDOWN_TEMPLATE_COMMENT_RE = /^\s*\/\//

// supple 补充块开始行：+++ suppleTemplate --start 或 +++ supple --start。
export const MARKDOWN_SUPPLE_START_RE = /^\s*\+\+\+\s+(?:suppleTemplate|supple)\s+--start\s*$/

// log 补充块开始行：+++ logTemplate --start 或 +++ log --start。
export const MARKDOWN_LOG_START_RE = /^\s*\+\+\+\s+(?:logTemplate|log)\s+--start\s*$/

// supple 补充块结束行：+++ suppleTemplate --end 或 +++ supple --end，可选携带 {id:...} 与 {wt:...}。
export const MARKDOWN_SUPPLE_END_RE =
  /^\s*\+\+\+\s+(?:suppleTemplate|supple)\s+--end(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$/

// preset 预设块开始行：+++ presetTemplate --start [「title: 标题」] 或 +++ preset --start [「title: 标题」]。
export const MARKDOWN_PRESET_START_RE =
  /^\s*\+\+\+\s+(?:presetTemplate|preset)\s+--start(?:\s+「title:[^」\n]*」)?\s*$/

// preset 预设块结束行：+++ presetTemplate --end 或 +++ preset --end。
export const MARKDOWN_PRESET_END_RE = /^\s*\+\+\+\s+(?:presetTemplate|preset)\s+--end\s*$/

// 变量模板块开始行：$$$ varTemplate [--start] [「title: 标题」]。
export const MARKDOWN_VAR_TEMPLATE_START_RE =
  /^\s*\$\$\$\s+varTemplate(?:\s+--start)?(?:\s+「title:[^」\n]*」)?\s*$/

// 变量模板块结束行：$$$ [varTemplate --end | --end]。
export const MARKDOWN_VAR_TEMPLATE_END_RE = /^\s*\$\$\$(?:\s+(?:varTemplate)\s+--end|\s+--end)?\s*$/

export interface ParsedMarkdownSuppleEnd {
  indent: string
  command: "suppleTemplate" | "supple"
  id?: string
  wt?: string
}

export const parseMarkdownSuppleEndLine = (lineText: string): ParsedMarkdownSuppleEnd | null => {
  const match = lineText.match(
    /^(\s*)\+\+\+\s+(suppleTemplate|supple)\s+--end(?:\s+\{id:([0-9a-f]{32})\})?(?:\s+\{wt:([^}\s{]+)\})?\s*$/,
  )
  if (!match) return null

  return {
    indent: match[1],
    command: match[2] as "suppleTemplate" | "supple",
    id: match[3],
    wt: match[4],
  }
}

// 读取 supple 补充块结束行的工作区绑定分支；非结束行或无绑定返回 null。
export const getMarkdownSuppleWorktree = (lineText: string): string | null => {
  return parseMarkdownSuppleEndLine(lineText)?.wt ?? null
}

// 更新 supple 补充块结束行的工作区绑定：branch 为 null 时移除绑定，否则写入 {wt:branch}。
export const setMarkdownSuppleWorktree = (lineText: string, branch: string | null): string => {
  const parsed = parseMarkdownSuppleEndLine(lineText)
  if (!parsed) return lineText

  const idPart = parsed.id ? ` {id:${parsed.id}}` : ""
  const wt = branch?.trim() ?? ""
  const wtPart = wt ? ` {wt:${wt}}` : ""
  return `${parsed.indent}+++ ${parsed.command} --end${idPart}${wtPart}`
}

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
 * 判断指定文本末尾是否处于未闭合的变量模板块（$$$ varTemplate）内。
 */
export const isInsideMarkdownVarTemplateBlock = (text: string): boolean => {
  let isOpen = false

  for (const line of text.split("\n")) {
    if (MARKDOWN_VAR_TEMPLATE_END_RE.test(line)) {
      isOpen = false
    } else if (MARKDOWN_VAR_TEMPLATE_START_RE.test(line)) {
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
 * 判断一行是否为 preset 预设块开始标记（+++ presetTemplate --start 或 +++ preset --start）。
 */
export const isMarkdownPresetStartLine = (line: string): boolean =>
  MARKDOWN_PRESET_START_RE.test(line)

/**
 * 判断一行是否为 preset 预设块结束标记（+++ presetTemplate --end 或 +++ preset --end）。
 */
export const isMarkdownPresetEndLine = (line: string): boolean => MARKDOWN_PRESET_END_RE.test(line)

/**
 * 判断指定文本末尾是否处于未闭合的 preset 预设块内。
 */
export const isInsideMarkdownPresetBlock = (text: string): boolean => {
  let isOpen = false

  for (const line of text.split("\n")) {
    if (isOpen) {
      if (MARKDOWN_PRESET_END_RE.test(line)) {
        isOpen = false
      }
    } else if (MARKDOWN_PRESET_START_RE.test(line)) {
      isOpen = true
    }
  }

  return isOpen
}

/**
 * 提取当前光标位置目标模版块用于复制的正文内容：
 * 规则：
 * 1. 若光标在 logTemplate 内部：
 *    - 不能单独复制，向上查找其所属的父级模版块（若在 suppleTemplate 内则复制该 suppleTemplate；若在 &&& 块内则复制该 &&& 块）。
 *    - 若不属于任何父模版块，返回 null。
 * 2. 若光标在非 logTemplate 的 +++ 模版块（如 suppleTemplate）内部：
 *    - 只复制该 +++ 模版块的内容；
 *    - 如果该 +++ 模版块内包含直接子级 logTemplate，连同其内容一起复制，并移除 +++ logTemplate 起止标记行。
 * 3. 若光标在 &&& 模版块中（且非任何可单独复制的 +++ 模版块内部）：
 *    - 复制该 &&& 模版块的内容；
 *    - 剔除其中的 suppleTemplate 及其嵌套内容；
 *    - 保留直接位于 &&& 块内部的 logTemplate 内容，并移除 +++ logTemplate 起止标记行。
 * 4. 光标不在任何上述模版块内，返回 null。
 */
export const getMarkdownTemplateBlockCopyText = (text: string, position: number): string | null => {
  const lines = text.split("\n")
  const boundedPosition = Math.min(Math.max(position, 0), text.length)

  // 1. 扫描行区间与层级
  // 计算每一行的 offset 范围
  let currentOffset = 0
  const lineRanges = lines.map((line) => {
    const from = currentOffset
    const to = currentOffset + line.length
    currentOffset = to + 1 // + \n
    return { from, to, line }
  })

  // 识别所有 block 的范围
  interface BlockRange {
    type: "template" | "supple" | "log"
    startLine: number
    endLine: number
    startOffset: number
    endOffset: number
    bodyStartOffset: number
    bodyEndOffset: number
    parentIndex: number | null
  }

  const blocks: BlockRange[] = []
  const templateStack: { line: number; offset: number; bodyStart: number }[] = []
  const suppleStack: {
    line: number
    offset: number
    bodyStart: number
    parentTemplateIdx: number | null
  }[] = []
  const logStack: { line: number; offset: number; bodyStart: number; parentIdx: number | null }[] =
    []

  for (let i = 0; i < lineRanges.length; i++) {
    const { from, to, line } = lineRanges[i]
    if (isMarkdownTemplateStartLine(line)) {
      templateStack.push({ line: i, offset: from, bodyStart: to + 1 })
    } else if (isMarkdownTemplateEndLine(line)) {
      const start = templateStack.pop()
      if (start) {
        blocks.push({
          type: "template",
          startLine: start.line,
          endLine: i,
          startOffset: start.offset,
          endOffset: to,
          bodyStartOffset: start.bodyStart,
          bodyEndOffset: from > 0 ? from - 1 : from,
          parentIndex: null,
        })
      }
    } else if (isMarkdownSuppleStartLine(line)) {
      const parentTemplateIdx = templateStack.length > 0 ? templateStack.length - 1 : null
      suppleStack.push({ line: i, offset: from, bodyStart: to + 1, parentTemplateIdx })
    } else if (isMarkdownSuppleEndLine(line)) {
      const start = suppleStack.pop()
      if (start) {
        blocks.push({
          type: "supple",
          startLine: start.line,
          endLine: i,
          startOffset: start.offset,
          endOffset: to,
          bodyStartOffset: start.bodyStart,
          bodyEndOffset: from > 0 ? from - 1 : from,
          parentIndex: null, // 稍后统一计算或关联
        })
      }
    } else if (isMarkdownLogStartLine(line)) {
      logStack.push({ line: i, offset: from, bodyStart: to + 1, parentIdx: null })
    } else if (isMarkdownLogEndLine(line)) {
      const start = logStack.pop()
      if (start) {
        blocks.push({
          type: "log",
          startLine: start.line,
          endLine: i,
          startOffset: start.offset,
          endOffset: to,
          bodyStartOffset: start.bodyStart,
          bodyEndOffset: from > 0 ? from - 1 : from,
          parentIndex: null,
        })
      }
    }
  }

  // 辅助函数：处理父级（无论是 template 还是 supple）复制内容
  // 规则：
  // 1. 移除子 supple 块；
  // 2. 保留子 log 块内容（移除 +++ 标记行）；
  // 3. 移除未填写的空 item、注释行及斜杠命令（与右上角复制按钮逻辑保持一致）。
  const formatBlockContent = (bodyLines: string[]): string => {
    const kept: string[] = []
    let inChildSupple = false

    for (const l of bodyLines) {
      if (isMarkdownSuppleStartLine(l)) {
        inChildSupple = true
        continue
      }
      if (inChildSupple) {
        if (isMarkdownSuppleEndLine(l)) {
          inChildSupple = false
        }
        continue
      }
      // 剔除 log 块的 +++ 起止标记行，保留其内容
      if (isMarkdownLogStartLine(l) || isMarkdownLogEndLine(l)) {
        continue
      }
      kept.push(l)
    }

    return stripEmptyTemplateItems(
      stripMarkdownTemplateComments(stripMarkdownSlashCommands(kept.join("\n"))),
    )
  }

  // 检查光标落入哪个最内层的块
  // 查找包含 boundedPosition 的所有 block
  const enclosingBlocks = blocks.filter(
    (b) => boundedPosition >= b.startOffset && boundedPosition <= b.endOffset,
  )

  if (enclosingBlocks.length === 0) {
    return null
  }

  // 按范围大小升序，最内层在前
  enclosingBlocks.sort((a, b) => a.endOffset - a.startOffset - (b.endOffset - b.startOffset))

  const innermost = enclosingBlocks[0]

  if (innermost.type === "log") {
    // logTemplate 不能单独复制，寻找其直接父模版块
    // 父模版块可能是 supple，也可能是 template
    const parent = enclosingBlocks.find((b) => b !== innermost)
    if (!parent) return null

    // 提取 parent 的 bodyLines
    const parentBodyLines = lines.slice(parent.startLine + 1, parent.endLine)
    return formatBlockContent(parentBodyLines)
  }

  if (innermost.type === "supple") {
    // 处于 supple 内部：只复制该 supple 块的内容
    // 如果内部包含 logTemplate，剔除 +++ 标记，保留 log 内容
    const suppleBodyLines = lines.slice(innermost.startLine + 1, innermost.endLine)
    return formatBlockContent(suppleBodyLines)
  }

  if (innermost.type === "template") {
    // 处于 &&& 模板块内部且不在子 supple / log 中
    const templateBodyLines = lines.slice(innermost.startLine + 1, innermost.endLine)
    return formatBlockContent(templateBodyLines)
  }

  return null
}

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
 * 返回 position 所在 supple 补充块结束行的行号（1-based）；不在 supple 块内或块未闭合返回 null。
 * 光标位于开始行、正文或结束行自身均返回所属块的结束行。
 */
export const getMarkdownSuppleBlockEndLine = (text: string, position: number): number | null => {
  const lines = text.split("\n")
  const boundedPosition = Math.min(Math.max(position, 0), text.length)
  let offset = 0
  let startOffset: number | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const lineStart = offset
    const lineContentEnd = lineStart + lines[index].length
    const lineEnd = lineContentEnd + 1

    if (isMarkdownSuppleStartLine(lines[index])) {
      startOffset = lineStart
    } else if (isMarkdownSuppleEndLine(lines[index])) {
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
  const parsed = parseMarkdownTemplateEndLine(lineText)
  if (!parsed) return null

  return parsed.status ?? "todo"
}

/**
 * 循环切换模板块结束行状态（未完成 -> 进行中 -> 已完成 -> 未完成）；非结束行返回 null。
 * 保留 command、--end、id 与 wt（工作区绑定）标记不变。
 */
export const cycleMarkdownTemplateStatus = (lineText: string): string | null => {
  const parsed = parseMarkdownTemplateEndLine(lineText)
  if (!parsed) return null

  const commandPart = parsed.command ? ` ${parsed.command}` : ""
  const endFlagPart = parsed.endFlag ? ` ${parsed.endFlag}` : ""
  const current = parsed.status ?? "todo"
  const next: MarkdownTemplateStatus =
    current === "todo" ? "in_progress" : current === "in_progress" ? "done" : "todo"
  const idPart = parsed.id ? ` {id:${parsed.id}}` : ""
  const wtPart = parsed.wt ? ` {wt:${parsed.wt}}` : ""

  return `${parsed.indent}${parsed.marker}${commandPart}${endFlagPart}${MARKDOWN_TEMPLATE_STATUS_SUFFIX[next] ?? ""}${idPart}${wtPart}`
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
 * 保留缩进、&&&、command、--end、状态标记与 id；非结束行返回原文本。
 */
export const setMarkdownTemplateWorktree = (lineText: string, branch: string | null): string => {
  const parsed = parseMarkdownTemplateEndLine(lineText)
  if (!parsed) return lineText

  const commandPart = parsed.command ? ` ${parsed.command}` : ""
  const endFlagPart = parsed.endFlag ? ` ${parsed.endFlag}` : ""
  const statusPart = parsed.status ? (MARKDOWN_TEMPLATE_STATUS_SUFFIX[parsed.status] ?? "") : ""
  const idPart = parsed.id ? ` {id:${parsed.id}}` : ""
  const wt = branch?.trim() ?? ""
  const wtPart = wt ? ` {wt:${wt}}` : ""
  return `${parsed.indent}${parsed.marker}${commandPart}${endFlagPart}${statusPart}${idPart}${wtPart}`
}

/**
 * 生成模板块 id：uuid 去除连字符后的 32 位小写十六进制，源码格式 {id:xxxxxxxx...}。
 */
export const createMarkdownTemplateId = (): string => crypto.randomUUID().replaceAll("-", "")

/**
 * 扫描文本中全部模板块及补充块结束行上的 id 源码范围，供编辑器只读保护使用。
 */
export const getMarkdownTemplateIdRanges = (text: string): { from: number; to: number }[] => {
  const ranges: { from: number; to: number }[] = []
  let offset = 0

  for (const line of text.split("\n")) {
    if (MARKDOWN_TEMPLATE_END_RE.test(line) || MARKDOWN_SUPPLE_END_RE.test(line)) {
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
 * 扫描文本中全部模板块及补充块结束行上的 wt（工作区绑定）源码范围，供编辑器只读保护使用。
 */
export const getMarkdownTemplateWtRanges = (text: string): { from: number; to: number }[] => {
  const ranges: { from: number; to: number }[] = []
  let offset = 0

  for (const line of text.split("\n")) {
    if (MARKDOWN_TEMPLATE_END_RE.test(line) || MARKDOWN_SUPPLE_END_RE.test(line)) {
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
      const status = getMarkdownTemplateStatus(line)
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
export const getMarkdownBlockCommands = (
  kind: MarkdownBlockTriggerKind,
  locale: Locale = "zh",
): MarkdownBlockCommand[] => (commandsByLocale[locale] ?? commandsByLocale.zh)[kind]

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
