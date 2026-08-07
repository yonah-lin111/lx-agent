import { RangeSetBuilder, StateEffect } from "@codemirror/state"
import { Decoration, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view"
import { createElement, Fragment } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  MarkdownActionCopyButton,
  MarkdownActionFoldButton,
} from "@/components/ui/LxMarkdown/extensions/markdownActionWidgets"

// 代码块折叠状态变更事件。
const markdownBlockFoldToggleEffect = StateEffect.define<void>()

class CodeBlockActionWidget extends WidgetType {
  private reactRoot: Root | null = null

  constructor(
    readonly codeText: string,
    readonly isFolded: boolean,
    readonly onToggleFold: () => void,
    readonly showFoldBtn = true,
  ) {
    super()
  }

  eq(other: CodeBlockActionWidget) {
    return (
      this.codeText === other.codeText &&
      this.isFolded === other.isFolded &&
      this.showFoldBtn === other.showFoldBtn
    )
  }

  toDOM() {
    const wrap = document.createElement("span")
    wrap.className = "cm-code-block-action-wrap"
    wrap.style.position = "absolute"
    wrap.style.top = "50%"
    wrap.style.right = "12px"
    wrap.style.display = "inline-flex"
    wrap.style.alignItems = "center"
    wrap.style.gap = "6px"
    wrap.style.background = "transparent"
    wrap.style.border = "none"
    wrap.style.borderRadius = "4px"
    wrap.style.padding = "2px 4px"
    wrap.style.zIndex = "10"
    wrap.style.transform = "translateY(-50%)"

    this.reactRoot = createRoot(wrap)
    this.reactRoot.render(
      createElement(Fragment, null, [
        createElement(MarkdownActionCopyButton, { text: this.codeText, label: "复制代码" }),
        ...(this.showFoldBtn
          ? [
              createElement(MarkdownActionFoldButton, {
                isFolded: this.isFolded,
                label: "折叠代码块",
                unfoldLabel: "展开代码块",
                onToggle: this.onToggleFold,
              }),
            ]
          : []),
      ]),
    )
    return wrap
  }

  destroy(_dom: HTMLElement): void {
    this.reactRoot?.unmount()
    this.reactRoot = null
  }
}

/**
 * 为不同 Markdown 标记添加独立颜色，弥补语法标签共用造成的辨识度不足。
 */
export const markdownMarkerHighlight = (showFolding = false) => {
  const markerPlugin = ViewPlugin.fromClass(
    class {
      decorations: ReturnType<typeof buildMarkdownMarkerDecorations>
      foldedIndices = new Set<number>()
      wasComposing = false

      constructor(view: EditorView) {
        this.decorations = buildMarkdownMarkerDecorations(
          view,
          this.foldedIndices,
          (index) => this.toggleFold(view, index),
          showFolding,
        )
      }

      update(update: ViewUpdate): void {
        if (update.view.composing) {
          if (update.docChanged) this.decorations = this.decorations.map(update.changes)
          this.wasComposing = true
          return
        }

        const isFoldToggled = update.transactions.some((transaction) =>
          transaction.effects.some((effect) => effect.is(markdownBlockFoldToggleEffect)),
        )
        if (!update.docChanged && !update.selectionSet && !isFoldToggled && !this.wasComposing)
          return

        this.wasComposing = false
        this.decorations = buildMarkdownMarkerDecorations(
          update.view,
          this.foldedIndices,
          (index) => this.toggleFold(update.view, index),
          showFolding,
        )
      }

      toggleFold(view: EditorView, index: number) {
        if (this.foldedIndices.has(index)) {
          this.foldedIndices.delete(index)
        } else {
          this.foldedIndices.add(index)
        }
        view.dispatch({ effects: markdownBlockFoldToggleEffect.of() })
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )

  return [markerPlugin]
}

/**
 * 扫描文档行并生成 Markdown 标记装饰。
 */
const buildMarkdownMarkerDecorations = (
  view: EditorView,
  foldedIndices = new Set<number>(),
  onToggleFold: (index: number) => void = () => {},
  showFolding = false,
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

    const addMarker = (from: number, to: number, className: string): void => {
      if (!currentFenceFolded) {
        allDecos.push({ type: "mark", from: offset + from, to: offset + to, className })
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
      allDecos.push({
        type: "mark",
        from: offset + fenceMatch[1].length,
        to: offset + fenceMatch[1].length + fenceMatch[2].length,
        className: "cm-md-code-fence-marker",
      })
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

        const fenceMarkerEnd = fenceMatch[1].length + fenceMatch[2].length
        const remainingText = line.slice(fenceMarkerEnd)
        const langMatch = remainingText.match(/^(\s*)(\S+)/)
        if (langMatch) {
          allDecos.push({
            type: "mark",
            from: offset + fenceMarkerEnd + langMatch[1].length,
            to: offset + fenceMarkerEnd + langMatch[1].length + langMatch[2].length,
            className: "cm-md-code-fence-language",
          })
        }

        allDecos.push({
          type: "widget",
          from: offset + line.length,
          to: offset + line.length,
          widget: new CodeBlockActionWidget(
            currentFenceTextLines.join("\n"),
            currentFenceFolded,
            () => onToggleFold(currentBlockIdx),
            showFolding,
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
    addMatches(/(?<![\\]【)(?<=\【)[^【】\r\n]+(?=\】)/g, "cm-md-bracket-content-marker")
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
