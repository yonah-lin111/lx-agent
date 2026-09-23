import type { LucideIcon } from "lucide-react"

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

export interface MarkdownListContinuation {
  prefix: string
  markerLength: number
  empty: boolean
}

export interface ParsedMarkdownSuppleEnd {
  indent: string
  command: string
  id?: string
  wt?: string
}

// 规范化后的模板块正文与标题兜底。
export interface NormalizedAgentBlockBody {
  content: string
  title?: string
}
