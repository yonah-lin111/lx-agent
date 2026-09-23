import { HighlightStyle } from "@codemirror/language"
import { EditorView } from "@codemirror/view"
import { tags } from "@lezer/highlight"
import type {
  EditorScrollAnchor,
  MarkdownTableAlignment,
  MarkdownTableSize,
} from "@/components/ui/LxMarkdown/types"

export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "#e9a339", fontWeight: "700" },
  { tag: tags.heading1, color: "#e9a339", fontSize: "1.5em" },
  { tag: tags.heading2, color: "#e9a339", fontSize: "1.3em" },
  { tag: tags.heading3, color: "#e9a339", fontSize: "1.15em" },
  { tag: tags.heading4, color: "#e9a339", fontSize: "1.08em" },
  { tag: tags.heading5, color: "#e9a339", fontSize: "1.03em" },
  { tag: tags.heading6, color: "#e9a339", fontSize: "1.0em" },
  { tag: tags.emphasis, color: "#fcd34d", fontStyle: "italic" },
  { tag: tags.strong, color: "#f59e0b", fontWeight: "700" },
  { tag: tags.strikethrough, color: "#fda4af", textDecoration: "line-through" },
  { tag: tags.link, color: "#93c5fd", textDecoration: "underline" },
  { tag: tags.url, color: "#67e8f9" },
  { tag: tags.quote, color: "#c4b5fd", fontStyle: "italic" },
  {
    tag: tags.monospace,
    color: "#fca5a5",
    backgroundColor: "rgba(252, 165, 165, 0.12)",
    borderRadius: "3px",
    padding: "1px 4px",
  },
  { tag: [tags.meta, tags.processingInstruction], color: "#7dd3fc" },
  { tag: tags.keyword, color: "#c4b5fd" },
  { tag: tags.string, color: "#86efac" },
  { tag: tags.number, color: "#fda4af" },
  { tag: tags.comment, color: "#94a3b8", fontStyle: "italic" },
  { tag: tags.variableName, color: "#e2e8f0" },
  { tag: tags.typeName, color: "#67e8f9" },
  { tag: tags.propertyName, color: "#93c5fd" },
  { tag: tags.operator, color: "#fcd34d" },
])

// 生成包含表头和内容行的 Markdown 表格。
export const createMarkdownTable = ({ columns, rows }: MarkdownTableSize): string => {
  const createRow = (firstCell = ""): string => `| ${firstCell} |${" |".repeat(columns - 1)}\n`
  return `${createRow("Header")}|${" --- |".repeat(columns)}\n${createRow("Content")}${createRow().repeat(rows - 1)}`
}

const markdownTableSeparatorCellPattern = /^:?-+:?$/

const splitMarkdownTableRow = (line: string): string[] | null => {
  const trimmedLine = line.trim()
  if (!trimmedLine.includes("|")) return null

  const content = trimmedLine.replace(/^\|/, "").replace(/\|$/, "")
  const cells = content.split("|").map((cell) => cell.trim())
  return cells.length > 1 ? cells : null
}

const getMarkdownTableAlignment = (cell: string): MarkdownTableAlignment => {
  const startsWithColon = cell.startsWith(":")
  const endsWithColon = cell.endsWith(":")
  if (startsWithColon && endsWithColon) return "center"
  if (endsWithColon) return "right"
  return "left"
}

const formatMarkdownTable = (lines: string[]): string[] => {
  const rows = lines.map(splitMarkdownTableRow)
  if (rows.some((row) => row === null)) return lines

  const tableRows = rows as string[][]
  const separatorIndex = tableRows.findIndex((row) =>
    row.every((cell) => markdownTableSeparatorCellPattern.test(cell)),
  )
  if (separatorIndex !== 1) return lines

  const columnCount = Math.max(...tableRows.map((row) => row.length))
  const normalizedRows = tableRows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
  )
  const alignments = normalizedRows[separatorIndex].map(getMarkdownTableAlignment)

  return normalizedRows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      if (rowIndex !== separatorIndex) return cell
      const alignment = alignments[columnIndex]
      if (alignment === "center") return ":-:"
      if (alignment === "right") return "--:"
      return "---"
    })
    return `| ${cells.join(" | ")} |`
  })
}

/**
 * 按常见 Markdown 约定整理文档格式，不修改代码围栏内部内容。
 */
export const formatMarkdown = (content: string): string => {
  if (content.trim().length === 0) return ""

  const sourceLines = content.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n")
  const formattedLines: string[] = []
  let inCodeFence = false

  for (let index = 0; index < sourceLines.length; index += 1) {
    const sourceLine = sourceLines[index]
    const trimmedLine = sourceLine.trim()
    if (/^\s*(`{3,}|~{3,})/.test(sourceLine)) {
      inCodeFence = !inCodeFence
      formattedLines.push(inCodeFence ? sourceLine.trimEnd() : sourceLine.trim())
      continue
    }
    if (inCodeFence) {
      formattedLines.push(sourceLine)
      continue
    }

    const tableRows = [sourceLine]
    const nextLine = sourceLines[index + 1]
    if (nextLine && splitMarkdownTableRow(sourceLine) && splitMarkdownTableRow(nextLine)) {
      tableRows.push(nextLine)
      let tableIndex = index + 2
      while (tableIndex < sourceLines.length && splitMarkdownTableRow(sourceLines[tableIndex])) {
        tableRows.push(sourceLines[tableIndex])
        tableIndex += 1
      }
      const formattedTable = formatMarkdownTable(tableRows)
      const tableChanged =
        formattedTable.length !== tableRows.length ||
        formattedTable.some((line, lineIndex) => line !== tableRows[lineIndex])
      if (tableChanged) {
        formattedLines.push(...formattedTable)
        index = tableIndex - 1
        continue
      }
    }

    const normalizedLine =
      trimmedLine.length === 0
        ? ""
        : sourceLine
            .trimEnd()
            .replace(/^(\s*)[*+](\s+)/, "$1- ")
            .replace(/^(\s*)(\d+)[.)](\s+)/, "$1$2. ")
    formattedLines.push(normalizedLine)
  }

  return `${formattedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`
}

const getMarkdownLineAtPosition = (
  content: string,
  position: number,
): { index: number; start: number; text: string } => {
  const lines = content.split("\n")
  let start = 0
  const boundedPosition = Math.min(Math.max(position, 0), content.length)

  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]
    if (boundedPosition <= start + text.length || index === lines.length - 1) {
      return { index, start, text }
    }
    start += text.length + 1
  }

  return { index: 0, start: 0, text: lines[0] ?? "" }
}

const getMarkdownLineSignature = (text: string): string => text.replace(/\s/g, "")

const findMarkdownLineIndex = (lines: string[], sourceIndex: number, signature: string): number => {
  if (getMarkdownLineSignature(lines[sourceIndex] ?? "") === signature) return sourceIndex

  for (let distance = 1; distance < lines.length; distance += 1) {
    const nextIndex = sourceIndex + distance
    if (nextIndex < lines.length && getMarkdownLineSignature(lines[nextIndex]) === signature) {
      return nextIndex
    }
    const previousIndex = sourceIndex - distance
    if (previousIndex >= 0 && getMarkdownLineSignature(lines[previousIndex]) === signature) {
      return previousIndex
    }
  }

  return Math.min(sourceIndex, Math.max(lines.length - 1, 0))
}

const mapMarkdownColumn = (
  sourceLine: string,
  targetLine: string,
  sourceColumn: number,
): number => {
  const meaningfulCharacters = sourceLine.slice(0, sourceColumn).replace(/\s/g, "").length
  if (meaningfulCharacters === 0) return 0

  let meaningfulCount = 0
  for (let index = 0; index < targetLine.length; index += 1) {
    if (!/\s/.test(targetLine[index])) meaningfulCount += 1
    if (meaningfulCount >= meaningfulCharacters) return index + 1
  }

  return targetLine.length
}

/**
 * 根据原行内容将编辑器选区位置映射到格式化后的文档。
 */
export const mapMarkdownPosition = (
  sourceContent: string,
  formattedContent: string,
  position: number,
): number => {
  const sourceLine = getMarkdownLineAtPosition(sourceContent, position)
  const formattedLines = formattedContent.split("\n")
  const targetIndex = findMarkdownLineIndex(
    formattedLines,
    sourceLine.index,
    getMarkdownLineSignature(sourceLine.text),
  )
  let targetStart = 0
  for (let index = 0; index < targetIndex; index += 1) {
    targetStart += (formattedLines[index]?.length ?? 0) + 1
  }

  return (
    targetStart +
    mapMarkdownColumn(
      sourceLine.text,
      formattedLines[targetIndex] ?? "",
      position - sourceLine.start,
    )
  )
}

/**
 * 全选编辑器内容，并在选区渲染后恢复原有滚动位置。
 */
export const selectAllPreservingScrollPosition = (view: EditorView): boolean => {
  const { scrollLeft, scrollTop } = view.scrollDOM
  view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } })

  requestAnimationFrame(() => {
    view.scrollDOM.scrollTo({ left: scrollLeft, top: scrollTop })
  })

  return true
}

/**
 * 记录编辑器当前可见行和相对偏移，供文档重排后恢复视觉位置。
 */
export const captureEditorScrollAnchor = (view: EditorView): EditorScrollAnchor => {
  const { scrollLeft, scrollTop } = view.scrollDOM
  const block = view.lineBlockAtHeight(scrollTop)
  return {
    left: scrollLeft,
    line: view.state.doc.lineAt(block.from).number,
    offset: scrollTop - block.top,
  }
}

/**
 * 在 CodeMirror 完成文档测量后恢复之前的滚动位置。
 */
export const restoreEditorScrollAnchor = (view: EditorView, anchor: EditorScrollAnchor): void => {
  view.requestMeasure({
    read: () => anchor,
    write: (scrollAnchor, measuredView) => {
      const line = measuredView.state.doc.line(
        Math.min(scrollAnchor.line, measuredView.state.doc.lines),
      )
      const block = measuredView.lineBlockAt(line.from)
      measuredView.scrollDOM.scrollTo({
        left: scrollAnchor.left,
        top: block.top + scrollAnchor.offset,
      })
    },
  })
}
