import type { Line, Text } from "@codemirror/state"
import { MARKDOWN_VAR_TEMPLATE_END_RE, MARKDOWN_VAR_TEMPLATE_START_RE } from "./variableSyntax"

// 变量模板块内固定 @ 内容块的保留键。
export const MARKDOWN_VAR_CONTENT_KEY = "@content"

// @content 保留键行：缩进 + @content + 冒号。
const MARKDOWN_VAR_CONTENT_KEY_RE = /^(\s*)@content\s*:\s*$/

// @content 条目行：缩进 + 列表标记 + 内容。
const MARKDOWN_VAR_CONTENT_ITEM_RE = /^(\s*)[-*][ \t]+(\S.*)$/

// 文本变更。
export interface MarkdownVarContentChange {
  from: number
  to: number
  insert: string
}

// 首个变量模板块的行范围（1-based，含边界行）。
export interface MarkdownVarBlockRange {
  startLine: number
  endLine: number
}

// @content 块定位结果。
export interface MarkdownVarContentBlock {
  // 保留键行号（1-based）。
  contentLine: number
  // 已有条目文本（不含列表标记）。
  items: string[]
  // 追加锚点行：存在条目时为最后一个条目行，否则为保留键行。
  anchorLine: number
  // 保留键行缩进。
  indent: string
  // 条目缩进。
  itemIndent: string
}

// @content 追加结果：appended / duplicate 携带一次拍平的文本变更；missingBlock / invalidTarget 为执行失败原因。
export type MarkdownVarContentAppendResult =
  | { status: "appended"; changes: MarkdownVarContentChange[] }
  | { status: "duplicate"; changes: MarkdownVarContentChange[] }
  | { status: "missingBlock" }
  | { status: "invalidTarget" }

/**
 * 判断一行是否为 @content 保留键行。
 */
export const isMarkdownVarContentKeyLine = (lineText: string): boolean =>
  MARKDOWN_VAR_CONTENT_KEY_RE.test(lineText)

/**
 * 判断一行是否为 @content 条目行。
 */
export const isMarkdownVarContentItemLine = (lineText: string): boolean =>
  MARKDOWN_VAR_CONTENT_ITEM_RE.test(lineText)

/**
 * 定位文档中首个 $$$ 变量模板块的行范围；不存在时返回 null。
 */
export const findFirstMarkdownVarBlock = (doc: Text): MarkdownVarBlockRange | null => {
  let startLine = -1

  for (let number = 1; number <= doc.lines; number++) {
    if (startLine === -1) {
      if (MARKDOWN_VAR_TEMPLATE_START_RE.test(doc.line(number).text)) {
        startLine = number
      }
      continue
    }
    if (MARKDOWN_VAR_TEMPLATE_END_RE.test(doc.line(number).text)) {
      return { startLine, endLine: number }
    }
  }

  return null
}

/**
 * 在变量模板块内定位 @content 保留键与条目；块内无保留键时返回 null。
 * 条目按保留键后的连续列表行收集（允许空行），遇到其他内容行视为条目区结束；
 * 三引号多行字符串内的 @content 行不视为保留键。
 */
export const findMarkdownVarContentBlock = (
  doc: Text,
  block: MarkdownVarBlockRange,
): MarkdownVarContentBlock | null => {
  let contentLine = -1
  let inTripleQuotes = false

  for (let number = block.startLine + 1; number < block.endLine; number++) {
    const text = doc.line(number).text
    const tripleCount = text.split('"""').length - 1
    if (inTripleQuotes) {
      if (tripleCount % 2 === 1) inTripleQuotes = false
      continue
    }
    if (tripleCount % 2 === 1) {
      inTripleQuotes = true
      continue
    }
    if (isMarkdownVarContentKeyLine(text)) {
      contentLine = number
      break
    }
  }

  if (contentLine === -1) return null

  const indent = MARKDOWN_VAR_CONTENT_KEY_RE.exec(doc.line(contentLine).text)?.[1] ?? ""
  const items: string[] = []
  let anchorLine = contentLine

  for (let number = contentLine + 1; number < block.endLine; number++) {
    const line = doc.line(number)
    if (line.text.trim() === "") continue
    const itemMatch = MARKDOWN_VAR_CONTENT_ITEM_RE.exec(line.text)
    if (!itemMatch) break
    items.push(itemMatch[2].trim())
    anchorLine = number
  }

  return { contentLine, items, anchorLine, indent, itemIndent: `${indent}  ` }
}

/**
 * 收集文档中全部变量模板块 @content 的条目文本，供字母快捷输入候选使用。
 */
export const getMarkdownVarContentItems = (docText: string): string[] => {
  const lines = docText.split(/\r?\n/)
  const items: string[] = []
  let inBlock = false
  let inContent = false

  for (const line of lines) {
    if (!inBlock) {
      if (MARKDOWN_VAR_TEMPLATE_START_RE.test(line)) {
        inBlock = true
        inContent = false
      }
      continue
    }
    if (MARKDOWN_VAR_TEMPLATE_END_RE.test(line)) {
      inBlock = false
      inContent = false
      continue
    }
    if (inContent) {
      const itemMatch = MARKDOWN_VAR_CONTENT_ITEM_RE.exec(line)
      if (itemMatch) {
        items.push(itemMatch[2].trim())
        continue
      }
      if (line.trim() !== "") inContent = false
      continue
    }
    if (isMarkdownVarContentKeyLine(line)) {
      inContent = true
    }
  }

  return items
}

/**
 * 删除命令行内容，保留该行换行（与 /gitWorktree 清空命令行行为一致）。
 */
const getCommandLineRemoval = (line: Line): MarkdownVarContentChange => ({
  from: line.from,
  to: line.to,
  insert: "",
})

/**
 * 组合「追加内容」与「清空命令行」两类变更；插入点与清空范围不重叠，可直接并行下发。
 */
const mergeCommandLineRemoval = (
  line: Line,
  insertPos: number,
  insertText: string,
): MarkdownVarContentChange[] => {
  const removal = getCommandLineRemoval(line)
  if (!insertText) return [removal]
  return [removal, { from: insertPos, to: insertPos, insert: insertText }]
}

/**
 * 构建 /addContent 命令执行变更：把条目追加到首个变量模板块的 @content 列表并删除命令行。
 * 条目已存在时仅删除命令行；无变量块或命令行占用了块结构行时返回失败状态。
 */
export const buildMarkdownVarContentAppend = (
  doc: Text,
  commandLineNumber: number,
  entry: string,
): MarkdownVarContentAppendResult => {
  const cleanEntry = entry.trim()
  if (!cleanEntry || commandLineNumber < 1 || commandLineNumber > doc.lines) {
    return { status: "invalidTarget" }
  }

  const block = findFirstMarkdownVarBlock(doc)
  if (!block) return { status: "missingBlock" }

  const commandLine = doc.line(commandLineNumber)
  const content = findMarkdownVarContentBlock(doc, block)

  if (!content) {
    if (commandLineNumber === block.startLine || commandLineNumber === block.endLine) {
      return { status: "invalidTarget" }
    }
    const indent = doc.line(block.startLine).text.match(/^\s*/)?.[0] ?? ""
    const insertText = `\n${indent}${MARKDOWN_VAR_CONTENT_KEY}:\n${indent}  - ${cleanEntry}`
    return {
      status: "appended",
      changes: mergeCommandLineRemoval(commandLine, doc.line(block.startLine).to, insertText),
    }
  }

  const status = content.items.includes(cleanEntry) ? "duplicate" : "appended"

  // 命令行占用了锚点行：还原保留键并把新条目追加在其下方。
  if (commandLineNumber === content.anchorLine) {
    const baseText =
      content.anchorLine === content.contentLine
        ? `${content.indent}${MARKDOWN_VAR_CONTENT_KEY}:`
        : commandLine.text
    const insert =
      status === "duplicate" ? baseText : `${baseText}\n${content.itemIndent}- ${cleanEntry}`
    return { status, changes: [{ from: commandLine.from, to: commandLine.to, insert }] }
  }

  const insertText = status === "duplicate" ? "" : `\n${content.itemIndent}- ${cleanEntry}`
  return {
    status,
    changes: mergeCommandLineRemoval(commandLine, doc.line(content.anchorLine).to, insertText),
  }
}
