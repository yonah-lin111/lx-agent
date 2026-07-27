import { HighlightStyle } from "@codemirror/language"
import { RangeSetBuilder } from "@codemirror/state"
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view"
import { tags } from "@lezer/highlight"
import type { MarkdownTableSize } from "@/components/ui/LxMarkdown/types"

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
    ".cm-md-code-fence-language, .cm-md-code-fence-language *": {
      color: "#38bdf8 !important",
      fontWeight: "700",
      backgroundColor: "rgba(56, 189, 248, 0.12)",
      padding: "1px 6px",
      borderRadius: "3px",
    },
    ".cm-md-code-fence-start-line": {
      borderTop: "1px solid rgba(255, 255, 255, 0.08)",
      borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
      borderRight: "1px solid rgba(255, 255, 255, 0.08)",
      borderTopLeftRadius: "6px",
      borderTopRightRadius: "6px",
      backgroundColor: "rgba(255, 255, 255, 0.015)",
      paddingLeft: "6px",
      paddingTop: "4px",
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

class CodeBlockActionWidget extends WidgetType {
  constructor(
    readonly codeText: string,
    readonly isFolded: boolean,
    readonly onToggleFold: () => void,
  ) {
    super()
  }

  eq(other: CodeBlockActionWidget) {
    return this.codeText === other.codeText && this.isFolded === other.isFolded
  }

  toDOM() {
    const wrap = document.createElement("span")
    wrap.className = "cm-code-block-action-wrap"
    wrap.style.position = "absolute"
    wrap.style.right = "24px"
    wrap.style.display = "inline-flex"
    wrap.style.alignItems = "center"
    wrap.style.gap = "6px"
    wrap.style.background = "transparent"
    wrap.style.border = "none"
    wrap.style.borderRadius = "4px"
    wrap.style.padding = "2px 4px"
    wrap.style.zIndex = "10"
    wrap.style.transform = "translateY(-4px)"

    // 复制按钮
    const copyBtn = document.createElement("button")
    copyBtn.type = "button"
    copyBtn.className = "cm-code-block-action-btn"
    copyBtn.style.border = "none"
    copyBtn.style.background = "transparent"
    copyBtn.style.cursor = "pointer"
    copyBtn.style.display = "flex"
    copyBtn.style.padding = "2px"
    copyBtn.style.color = "rgba(255, 255, 255, 0.5)"
    copyBtn.style.transition = "color 0.2s"
    copyBtn.title = "复制代码"
    copyBtn.onmouseenter = () => {
      copyBtn.style.color = "#ffffff"
    }
    copyBtn.onmouseleave = () => {
      copyBtn.style.color = "rgba(255, 255, 255, 0.5)"
    }

    // 复制图标 SVG
    copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`

    copyBtn.onclick = async (e) => {
      e.preventDefault()
      e.stopPropagation()
      try {
        await navigator.clipboard.writeText(this.codeText)
        copyBtn.style.color = "#86efac" // 变成绿色，表示成功
        copyBtn.title = "已复制"
        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9 17l-5-5"/></svg>`
        setTimeout(() => {
          copyBtn.style.color = "rgba(255, 255, 255, 0.5)"
          copyBtn.title = "复制代码"
          copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
        }, 1500)
      } catch (err) {
        console.error("Failed to copy text: ", err)
      }
    }

    // 折叠按钮
    const foldBtn = document.createElement("button")
    foldBtn.type = "button"
    foldBtn.className = "cm-code-block-action-btn"
    foldBtn.style.border = "none"
    foldBtn.style.background = "transparent"
    foldBtn.style.cursor = "pointer"
    foldBtn.style.display = "flex"
    foldBtn.style.padding = "2px"
    foldBtn.style.color = "rgba(255, 255, 255, 0.5)"
    foldBtn.style.transition = "color 0.2s"
    foldBtn.title = this.isFolded ? "展开代码块" : "折叠代码块"
    foldBtn.onmouseenter = () => {
      foldBtn.style.color = "#ffffff"
    }
    foldBtn.onmouseleave = () => {
      foldBtn.style.color = "rgba(255, 255, 255, 0.5)"
    }

    if (this.isFolded) {
      foldBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>`
    } else {
      foldBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-up"><path d="m18 15-6-6-6 6"/></svg>`
    }

    foldBtn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.onToggleFold()
    }

    wrap.appendChild(copyBtn)
    wrap.appendChild(foldBtn)

    return wrap
  }
}

/**
 * 为不同 Markdown 标记添加独立颜色，弥补语法标签共用造成的辨识度不足。
 */
export const markdownMarkerHighlight = ViewPlugin.fromClass(
  class {
    decorations: ReturnType<typeof buildMarkdownMarkerDecorations>
    foldedIndices = new Set<number>()

    constructor(view: EditorView) {
      this.decorations = buildMarkdownMarkerDecorations(view, this.foldedIndices, (index) =>
        this.toggleFold(view, index),
      )
    }

    update(update: { docChanged: boolean; view: EditorView }): void {
      this.decorations = buildMarkdownMarkerDecorations(update.view, this.foldedIndices, (index) =>
        this.toggleFold(update.view, index),
      )
    }

    toggleFold(view: EditorView, index: number) {
      if (this.foldedIndices.has(index)) {
        this.foldedIndices.delete(index)
      } else {
        this.foldedIndices.add(index)
      }
      view.dispatch({})
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

/**
 * 扫描文档行并生成 Markdown 标记装饰。
 */
const buildMarkdownMarkerDecorations = (
  view: EditorView,
  foldedIndices = new Set<number>(),
  onToggleFold: (index: number) => void = () => {},
) => {
  const builder = new RangeSetBuilder<Decoration>()
  const allDecos: (
    | { type: "line"; from: number; className: string }
    | { type: "mark"; from: number; to: number; className: string }
    | { type: "widget"; from: number; to: number; widget: CodeBlockActionWidget }
  )[] = []
  let offset = 0
  let isInsideCodeFence = false
  let currentFenceFolded = false
  let currentFenceTextLines: string[] = []
  let codeBlockIndex = 0

  const lines = Array.from(view.state.doc.iterLines())

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const addMarkerAlways = (from: number, to: number, className: string): void => {
      allDecos.push({ type: "mark", from: offset + from, to: offset + to, className })
    }
    const addMarker = (from: number, to: number, className: string): void => {
      if (!currentFenceFolded) {
        addMarkerAlways(from, to, className)
      }
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
      addMarkerAlways(
        fenceMatch[1].length,
        fenceMatch[1].length + fenceMatch[2].length,
        "cm-md-code-fence-marker",
      )
      const isStart = !isInsideCodeFence

      if (isStart) {
        const currentBlockIdx = codeBlockIndex++
        currentFenceFolded = foldedIndices.has(currentBlockIdx)

        currentFenceTextLines = []
        for (let j = i + 1; j < lines.length; j++) {
          const subLine = lines[j]
          if (subLine.match(/^(\s*)(`{3,}|~{3,})/)) {
            break
          }
          currentFenceTextLines.push(subLine)
        }
        const collectedText = currentFenceTextLines.join("\n")

        const fenceMarkerEnd = fenceMatch[1].length + fenceMatch[2].length
        const remainingText = line.slice(fenceMarkerEnd)
        const langMatch = remainingText.match(/^(\s*)(\S+)/)
        if (langMatch) {
          addMarkerAlways(
            fenceMarkerEnd + langMatch[1].length,
            fenceMarkerEnd + langMatch[1].length + langMatch[2].length,
            "cm-md-code-fence-language",
          )
        }

        allDecos.push({
          type: "widget",
          from: offset + line.length,
          to: offset + line.length,
          widget: new CodeBlockActionWidget(collectedText, currentFenceFolded, () =>
            onToggleFold(currentBlockIdx),
          ),
        })

        allDecos.push({
          type: "line",
          from: offset,
          className: "cm-md-code-fence-start-line",
        })
      } else {
        if (currentFenceFolded) {
          allDecos.push({
            type: "line",
            from: offset,
            className: "cm-md-code-fence-hidden-line",
          })
        } else {
          allDecos.push({
            type: "line",
            from: offset,
            className: "cm-md-code-fence-end-line",
          })
        }
        currentFenceFolded = false
      }

      isInsideCodeFence = !isInsideCodeFence
      offset += line.length + 1
      continue
    }

    if (isInsideCodeFence) {
      if (currentFenceFolded) {
        allDecos.push({
          type: "line",
          from: offset,
          className: "cm-md-code-fence-hidden-line",
        })
      } else {
        allDecos.push({
          type: "line",
          from: offset,
          className: "cm-md-code-fence-middle-line",
        })
      }
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

  allDecos.sort((first, second) => {
    if (first.from !== second.from) {
      return first.from - second.from
    }
    if (first.type === "line" && second.type !== "line") return -1
    if (first.type !== "line" && second.type === "line") return 1
    if (first.type === "widget" && second.type === "mark") return -1
    if (first.type === "mark" && second.type === "widget") return 1
    if (first.type === "mark" && second.type === "mark") {
      return first.to - second.to
    }
    return 0
  })
  for (const deco of allDecos) {
    if (deco.type === "line") {
      builder.add(deco.from, deco.from, Decoration.line({ attributes: { class: deco.className } }))
    } else if (deco.type === "widget") {
      builder.add(deco.from, deco.to, Decoration.widget({ widget: deco.widget, side: 1 }))
    } else {
      builder.add(deco.from, deco.to, Decoration.mark({ class: deco.className }))
    }
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
