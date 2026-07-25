import type { LucideIcon } from "lucide-react"
import { Code, Heading, List, ListOrdered, ListTodo, Quote, Table2 } from "lucide-react"

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
    ["orderedList", /^(\s*)\d+[.)]\s?$/],
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
