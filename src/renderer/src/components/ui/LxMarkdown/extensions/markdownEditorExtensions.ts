import { HighlightStyle } from "@codemirror/language"
import { EditorView } from "@codemirror/view"
import { tags } from "@lezer/highlight"
import type { MarkdownTableAlignment, MarkdownTableSize } from "@/components/ui/LxMarkdown/types"

export const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "#212121",
      color: "#e5e5e5",
      fontSize: "14px",
    },
    ".cm-content": {
      minHeight: "100%",
      padding: "12px 16px calc(100cqh - 1.85em - 12px)",
      caretColor: "#ffffff",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      lineHeight: "1.65",
    },
    ".cm-line": {
      // 内容行高
      lineHeight: "1.85",
      // 作为行内操作按钮（代码块右上角）的定位参照，实现垂直居中。
      position: "relative",
    },
    ".cm-scroller": {
      containerType: "size",
      overflow: "auto",
      scrollbarGutter: "stable",
    },
    ".cm-gutters": {
      minHeight: "100%",
      borderRight: "1px solid rgba(255, 255, 255, 0.05)",
      backgroundColor: "#212121",
      color: "rgba(255, 255, 255, 0.3)",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      paddingLeft: "10px",
      paddingRight: "6px",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "flex-end",
      boxSizing: "border-box",
      height: "1.65em",
      lineHeight: "1.65em",
    },
    ".cm-foldGutter .cm-gutterElement": {
      cursor: "pointer",
      color: "rgba(255, 255, 255, 0.35)",
      transition: "color 0.15s ease",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      paddingLeft: "4px",
      paddingRight: "8px",
      boxSizing: "border-box",
    },
    ".cm-gutters > .cm-foldGutter:first-child .cm-gutterElement": {
      paddingLeft: "8px",
      paddingRight: "8px",
    },
    ".cm-foldGutter .cm-gutterElement:hover": {
      color: "#ffffff",
    },
    ".cm-fold-marker": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "12px",
      height: "1.65em",
      color: "currentColor",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      border: "none",
      color: "rgba(255, 255, 255, 0.5)",
      borderRadius: "3px",
      padding: "2px 4px",
      margin: "0 4px",
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      verticalAlign: "middle",
      userSelect: "none",
      transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
    },
    ".cm-foldPlaceholder:hover": {
      backgroundColor: "rgba(255, 255, 255, 0.18)",
      color: "#ffffff",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.035)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(255, 255, 255, 0.035)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(255, 255, 255, 0.18)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#ffffff",
    },
    ".cm-tooltip": {
      backgroundColor: "#2b2b2b",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      borderRadius: "6px",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
      padding: "6px",
      zIndex: 100,
    },
    ".cm-md-heading-marker, .cm-md-heading-marker *": {
      color: "#e9a339 !important",
      fontWeight: "700",
    },
    ".cm-md-strong-marker, .cm-md-strong-marker *": {
      color: "#fb923c !important",
      fontWeight: "700",
    },
    ".cm-md-emphasis-marker, .cm-md-emphasis-marker *": {
      color: "#f472b6 !important",
      fontWeight: "700",
    },
    ".cm-md-table-marker, .cm-md-table-marker *": {
      color: "#38bdf8 !important",
      fontWeight: "700",
    },
    ".cm-md-task-marker, .cm-md-task-marker *": {
      color: "#a3e635 !important",
      fontWeight: "700",
    },
    ".cm-md-unordered-list-marker, .cm-md-unordered-list-marker *": {
      color: "#2dd4bf !important",
      fontWeight: "700",
    },
    ".cm-md-ordered-list-marker, .cm-md-ordered-list-marker *": {
      color: "#c084fc !important",
      fontWeight: "700",
    },
    ".cm-md-code-fence-marker, .cm-md-code-fence-marker *": {
      color: "#e879f9 !important",
      fontWeight: "700",
    },
    ".cm-md-bracket-content-marker, .cm-md-bracket-content-marker *": {
      textDecoration: "underline",
      textDecorationColor: "rgba(255, 255, 255, 0.4)",
    },
    ".cm-md-code-fence-language, .cm-md-code-fence-language *": {
      color: "#38bdf8 !important",
      fontWeight: "700",
      backgroundColor: "rgba(56, 189, 248, 0.12) !important",
      padding: "1px 6px !important",
      borderRadius: "3px !important",
    },
    ".cm-md-code-fence-start-line": {
      borderTop: "1px solid rgba(255, 255, 255, 0.08)",
      borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
      borderRight: "1px solid rgba(255, 255, 255, 0.08)",
      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
      borderTopLeftRadius: "6px",
      borderTopRightRadius: "6px",
      backgroundColor: "rgba(255, 255, 255, 0.015)",
      paddingLeft: "6px",
      paddingTop: "4px",
      paddingBottom: "4px",
    },
    ".cm-md-code-fence-middle-line": {
      borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
      borderRight: "1px solid rgba(255, 255, 255, 0.08)",
      backgroundColor: "rgba(255, 255, 255, 0.015)",
      paddingLeft: "6px",
    },
    ".cm-md-code-fence-end-line": {
      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
      borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
      borderRight: "1px solid rgba(255, 255, 255, 0.08)",
      borderBottomLeftRadius: "6px",
      borderBottomRightRadius: "6px",
      backgroundColor: "rgba(255, 255, 255, 0.015)",
      paddingLeft: "6px",
      paddingBottom: "4px",
    },
    ".cm-md-inline-code-marker, .cm-md-inline-code-marker *": {
      color: "#fb7185 !important",
      fontWeight: "700",
    },
    ".cm-md-quote-marker, .cm-md-quote-marker *": {
      color: "#a5b4fc !important",
      fontWeight: "700",
    },
    ".cm-md-link-marker, .cm-md-link-marker *": {
      color: "#86efac !important",
      fontWeight: "700",
    },
    ".cm-md-strike-marker, .cm-md-strike-marker *": {
      color: "#fda4af !important",
      fontWeight: "700",
    },
    ".cm-md-separator-marker, .cm-md-separator-marker *": {
      color: "#fde047 !important",
      fontWeight: "700",
    },
    ".cm-md-code-fence-hidden-line": {
      display: "none !important",
    },
    ".cm-md-code-fence-start-line .cm-monospace, .cm-md-code-fence-middle-line .cm-monospace, .cm-md-code-fence-end-line .cm-monospace":
      {
        color: "inherit !important",
        backgroundColor: "transparent !important",
        padding: "0 !important",
        borderRadius: "0 !important",
      },
    ".cm-md-code-fence-start-line span:not(.cm-md-code-fence-language), .cm-md-code-fence-middle-line span, .cm-md-code-fence-end-line span":
      {
        backgroundColor: "transparent !important",
        padding: "0 !important",
        borderRadius: "0 !important",
      },
  },
  { dark: true },
)

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

// Markdown 同步滚动锚点。
interface MarkdownScrollAnchor {
  line: number
  top: number
}

const getPreviewScrollAnchors = (preview: HTMLElement): MarkdownScrollAnchor[] =>
  Array.from(preview.querySelectorAll<HTMLElement>(".markdown-preview-content > [data-line]"))
    .map((element) => ({
      line: Number(element.dataset.line),
      top:
        element.getBoundingClientRect().top -
        preview.getBoundingClientRect().top +
        preview.scrollTop,
    }))
    .filter((anchor) => Number.isFinite(anchor.line))

const getAnchorIndex = (
  anchors: MarkdownScrollAnchor[],
  position: number,
  key: "line" | "top",
): number => {
  for (let index = anchors.length - 1; index >= 0; index -= 1) {
    if (anchors[index][key] <= position) return index
  }

  return -1
}

const getEditorLineTop = (view: EditorView, line: number): number =>
  line === 0 ? 0 : view.lineBlockAt(view.state.doc.line(line + 1).from).top

const synchronizeScrollPosition = (
  sourcePosition: number,
  sourceStart: number,
  sourceEnd: number,
  targetStart: number,
  targetEnd: number,
): number => {
  if (sourceEnd <= sourceStart || targetEnd <= targetStart) return targetStart

  const progress = Math.min(
    1,
    Math.max(0, (sourcePosition - sourceStart) / (sourceEnd - sourceStart)),
  )
  return targetStart + (targetEnd - targetStart) * progress
}

export const synchronizeEditorToPreview = (view: EditorView, preview: HTMLElement): void => {
  const editor = view.scrollDOM
  const anchors = getPreviewScrollAnchors(preview)
  if (anchors.length === 0) return

  const block = view.lineBlockAtHeight(editor.scrollTop)
  const line = view.state.doc.lineAt(block.from).number - 1
  const index = getAnchorIndex(anchors, line, "line")
  const anchor = anchors[index]
  const nextAnchor = anchors[index + 1]
  const sourceStart = anchor ? getEditorLineTop(view, anchor.line) : 0
  const sourceEnd = nextAnchor
    ? getEditorLineTop(view, nextAnchor.line)
    : editor.scrollHeight - editor.clientHeight
  const targetStart = anchor?.top ?? 0
  const targetEnd = nextAnchor ? nextAnchor.top : preview.scrollHeight - preview.clientHeight

  preview.scrollTop = synchronizeScrollPosition(
    editor.scrollTop,
    sourceStart,
    sourceEnd,
    targetStart,
    targetEnd,
  )
}

export const synchronizePreviewToEditor = (preview: HTMLElement, view: EditorView): void => {
  const editor = view.scrollDOM
  const anchors = getPreviewScrollAnchors(preview)
  if (anchors.length === 0) return

  const index = getAnchorIndex(anchors, preview.scrollTop, "top")
  const anchor = anchors[index]
  const nextAnchor = anchors[index + 1]
  const sourceStart = anchor?.top ?? 0
  const sourceEnd = nextAnchor ? nextAnchor.top : preview.scrollHeight - preview.clientHeight
  const targetStart = anchor ? getEditorLineTop(view, anchor.line) : 0
  const targetEnd = nextAnchor
    ? getEditorLineTop(view, nextAnchor.line)
    : editor.scrollHeight - editor.clientHeight

  editor.scrollTop = synchronizeScrollPosition(
    preview.scrollTop,
    sourceStart,
    sourceEnd,
    targetStart,
    targetEnd,
  )
}
