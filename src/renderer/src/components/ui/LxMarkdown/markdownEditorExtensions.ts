import { HighlightStyle } from "@codemirror/language"
import { RangeSetBuilder } from "@codemirror/state"
import { Decoration, EditorView, ViewPlugin } from "@codemirror/view"
import { tags } from "@lezer/highlight"
import type { MarkdownTableSize } from "@/components/ui/LxMarkdown/types"

export const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "#212121",
      color: "#e5e5e5",
      fontSize: "13px",
    },
    ".cm-content": {
      minHeight: "100%",
      padding: "12px 16px",
      caretColor: "#ffffff",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    },
    ".cm-scroller": {
      overflow: "auto",
    },
    ".cm-gutters": {
      minHeight: "100%",
      borderRight: "1px solid rgba(255, 255, 255, 0.05)",
      backgroundColor: "#212121",
      color: "rgba(255, 255, 255, 0.25)",
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
    ".cm-md-heading-marker, .cm-md-heading-marker *": {
      color: "#fbbf24 !important",
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
  },
  { dark: true },
)

export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "#f8fafc", fontWeight: "700" },
  { tag: [tags.heading1, tags.heading2], color: "#fbbf24" },
  { tag: [tags.heading3, tags.heading4], color: "#fde68a" },
  { tag: tags.emphasis, color: "#fcd34d", fontStyle: "italic" },
  { tag: tags.strong, color: "#f59e0b", fontWeight: "700" },
  { tag: tags.strikethrough, color: "#fda4af", textDecoration: "line-through" },
  { tag: tags.link, color: "#93c5fd", textDecoration: "underline" },
  { tag: tags.url, color: "#67e8f9" },
  { tag: tags.quote, color: "#c4b5fd", fontStyle: "italic" },
  { tag: tags.monospace, color: "#fca5a5" },
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

/**
 * 为不同 Markdown 标记添加独立颜色，弥补语法标签共用造成的辨识度不足。
 */
export const markdownMarkerHighlight = ViewPlugin.fromClass(
  class {
    decorations: ReturnType<typeof buildMarkdownMarkerDecorations>

    constructor(view: EditorView) {
      this.decorations = buildMarkdownMarkerDecorations(view)
    }

    update(update: { docChanged: boolean; view: EditorView }): void {
      if (update.docChanged) {
        this.decorations = buildMarkdownMarkerDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

/**
 * 扫描文档行并生成 Markdown 标记装饰。
 */
const buildMarkdownMarkerDecorations = (view: EditorView) => {
  const builder = new RangeSetBuilder<Decoration>()
  const markers: { from: number; to: number; className: string }[] = []
  let offset = 0
  let isInsideCodeFence = false

  for (const line of view.state.doc.iterLines()) {
    const addMarker = (from: number, to: number, className: string): void => {
      markers.push({ from: offset + from, to: offset + to, className })
    }
    const addMatches = (pattern: RegExp, className: string): void => {
      for (const match of line.matchAll(pattern)) {
        if (match.index !== undefined) {
          addMarker(match.index, match.index + match[0].length, className)
        }
      }
    }
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/)

    if (fenceMatch) {
      addMarker(
        fenceMatch[1].length,
        fenceMatch[1].length + fenceMatch[2].length,
        "cm-md-code-fence-marker",
      )
      isInsideCodeFence = !isInsideCodeFence
      offset += line.length + 1
      continue
    }

    if (isInsideCodeFence) {
      offset += line.length + 1
      continue
    }

    const headingMatch = line.match(/^(\s*)(#{1,6})(?=\s)/)
    if (headingMatch) {
      addMarker(
        headingMatch[1].length,
        headingMatch[1].length + headingMatch[2].length,
        "cm-md-heading-marker",
      )
    }

    const taskMatch = line.match(/^(\s*)([-+*])\s+(\[[ xX]\])/)
    if (taskMatch) {
      addMarker(
        taskMatch[1].length,
        taskMatch[1].length + taskMatch[2].length,
        "cm-md-unordered-list-marker",
      )
      const taskStart = taskMatch[1].length + taskMatch[2].length + 1
      addMarker(taskStart, taskStart + taskMatch[3].length, "cm-md-task-marker")
    } else {
      const unorderedMatch = line.match(/^(\s*)([-+*])(?=\s)/)
      const orderedMatch = line.match(/^(\s*)(\d+[.)])(?=\s)/)
      if (unorderedMatch) {
        addMarker(
          unorderedMatch[1].length,
          unorderedMatch[1].length + unorderedMatch[2].length,
          "cm-md-unordered-list-marker",
        )
      } else if (orderedMatch) {
        addMarker(
          orderedMatch[1].length,
          orderedMatch[1].length + orderedMatch[2].length,
          "cm-md-ordered-list-marker",
        )
      }
    }

    const quoteMatch = line.match(/^(\s*)(>+)/)
    if (quoteMatch) {
      addMarker(
        quoteMatch[1].length,
        quoteMatch[1].length + quoteMatch[2].length,
        "cm-md-quote-marker",
      )
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      addMatches(/(?<!\\)\|/g, "cm-md-table-marker")
    }

    if (/^\s*(?:[-*_])(?:\s*[-*_]){2,}\s*$/.test(line)) {
      addMatches(/[-*_]/g, "cm-md-separator-marker")
      offset += line.length + 1
      continue
    }

    addMatches(/(?<!\\)(?:\*\*|__)/g, "cm-md-strong-marker")
    addMatches(/(?<!\\)~~/g, "cm-md-strike-marker")
    addMatches(/(?<!\\)(?<!\*)(?:\*)(?!\*|\s)|(?<!\\)(?<!_)(?:_)(?!_|\s)/g, "cm-md-emphasis-marker")
    addMatches(/(?<!\\)`/g, "cm-md-inline-code-marker")
    if (!taskMatch) {
      addMatches(/(?<!\\)[\[\]\(\)]/g, "cm-md-link-marker")
    }

    offset += line.length + 1
  }

  markers.sort((first, second) => first.from - second.from || first.to - second.to)
  for (const marker of markers) {
    builder.add(marker.from, marker.to, Decoration.mark({ class: marker.className }))
  }

  return builder.finish()
}

// 生成包含表头和内容行的 Markdown 表格。
export const createMarkdownTable = ({ columns, rows }: MarkdownTableSize): string => {
  const createRow = (firstCell = ""): string => `| ${firstCell} |${"  |".repeat(columns - 1)}\n`
  return `${createRow("Header")}|${" --- |".repeat(columns)}\n${createRow("Content")}${createRow().repeat(rows - 1)}`
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
