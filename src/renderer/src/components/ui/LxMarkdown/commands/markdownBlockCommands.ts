import type { MarkdownPage } from "@shared/project"
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

// 模板块开始行：&&& command [「title: 标题」]；done/in_progress 为状态保留词。
const MARKDOWN_TEMPLATE_START_RE =
  /^\s*&&&\s+(?!done\b|in_progress\b)[A-Za-z]\w*(?:\s+「title:[^」\n]*」)?\s*$/

// 模板块结束行：&&& [状态标记]。
const MARKDOWN_TEMPLATE_END_RE = /^\s*&&&(?:\s+(?:done|in_progress))?\s*$/

// 模板块状态标记后缀（供 exec 捕获）。
const MARKDOWN_TEMPLATE_STATUS_CAPTURE_RE = /\s+(done|in_progress)\s*$/

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
 * 解析模板块结束行的源码状态；非结束行返回 null。
 */
export const getMarkdownTemplateStatus = (lineText: string): MarkdownTemplateStatus | null => {
  const match = /^(\s*)(&&&)(?:\s+(done|in_progress))?\s*$/.exec(lineText)
  if (!match) return null

  return (match[3] as MarkdownTemplateStatus | undefined) ?? "todo"
}

/**
 * 循环切换模板块结束行状态（未完成 -> 进行中 -> 已完成 -> 未完成）；非结束行返回 null。
 */
export const cycleMarkdownTemplateStatus = (lineText: string): string | null => {
  const match = /^(\s*)(&&&)(?:\s+(done|in_progress))?\s*$/.exec(lineText)
  if (!match) return null

  const current = (match[3] as MarkdownTemplateStatus | undefined) ?? "todo"
  const next: MarkdownTemplateStatus =
    current === "todo" ? "in_progress" : current === "in_progress" ? "done" : "todo"

  return `${match[1]}${match[2]}${MARKDOWN_TEMPLATE_STATUS_SUFFIX[next] ?? ""}`
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

// 模板块筛选标签：全部 / 具体状态。
export type MarkdownTemplateIntegrate = "all" | MarkdownTemplateStatus

// 模板块整合虚拟页的固定 id，用于标记不入库页面。
export const MARKDOWN_TEMPLATE_INTEGRATE_PAGE_ID = "markdown-template-integrate-page"

// 模板块整合选项的英文展示文案。
export const MARKDOWN_TEMPLATE_INTEGRATE_LABELS: Record<MarkdownTemplateIntegrate, string> = {
  all: "All",
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
}

// 已解析的模板块片段，保留源码原文以便恢复。
export interface MarkdownTemplateBlock {
  startText: string
  endText: string
  content: string
  status: MarkdownTemplateStatus
}

/**
 * 提取内容中全部已闭合的模板块片段；嵌套的 &&& 行按正文处理，与编辑器解析一致。
 */
export const extractMarkdownTemplateBlocks = (content: string): MarkdownTemplateBlock[] => {
  const blocks: MarkdownTemplateBlock[] = []
  let startText: string | null = null
  let body: string[] = []

  for (const line of content.split("\n")) {
    if (startText !== null && MARKDOWN_TEMPLATE_END_RE.test(line)) {
      blocks.push({
        startText,
        endText: line,
        content: body.join("\n"),
        status: getMarkdownTemplateStatus(line) ?? "todo",
      })
      startText = null
      continue
    }
    if (startText === null && MARKDOWN_TEMPLATE_START_RE.test(line)) {
      startText = line
      body = []
      continue
    }
    if (startText !== null) body.push(line)
  }

  return blocks
}

/**
 * 生成模板块整合虚拟页内容：每页标题带整合标记，仅保留匹配状态的模板块源码。
 * 选中 All 时按全部匹配处理；无匹配块时返回占位文本。
 */
export const buildMarkdownTemplateIntegratePage = (
  pages: readonly MarkdownPage[],
  integrate: readonly MarkdownTemplateIntegrate[],
): string => {
  const matchesAll = integrate.includes("all")
  const selectedStatuses = new Set<MarkdownTemplateStatus>(
    integrate.filter((value): value is MarkdownTemplateStatus => value !== "all"),
  )
  const sections: string[] = []

  for (const page of pages) {
    const blocks = extractMarkdownTemplateBlocks(page.content).filter(
      (block) => matchesAll || selectedStatuses.has(block.status),
    )
    if (blocks.length === 0) continue

    const parts = [`### ${page.name} 🔍`]
    for (const block of blocks) {
      parts.push("---", block.startText)
      if (block.content) parts.push(block.content)
      parts.push(block.endText)
    }
    sections.push(parts.join("\n"))
  }

  if (sections.length === 0) return "暂无匹配的模板块"
  return sections.join("\n\n")
}
