import { foldable, foldEffect, foldedRanges, foldService, unfoldEffect } from "@codemirror/language"
import { RangeSetBuilder } from "@codemirror/state"
import { GutterMarker, gutter } from "@codemirror/view"
import { isInsideMarkdownCodeFence } from "@/components/ui/LxMarkdown/commands/markdownBlockCommands"

/**
 * 为 ATX 标题提供折叠范围，直到下一个同级或更高层级标题。
 */
export const markdownHeadingFolding = foldService.of((state, lineStart) => {
  const headingLine = state.doc.lineAt(lineStart)
  const headingMatch = /^ {0,3}(#{1,6})(?:\s|$)/.exec(headingLine.text)
  if (!headingMatch || isInsideMarkdownCodeFence(state.doc.sliceString(0, headingLine.from))) {
    return null
  }

  const headingLevel = headingMatch[1].length
  for (let lineNumber = headingLine.number + 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const nextLine = state.doc.line(lineNumber)
    const nextHeadingMatch = /^ {0,3}(#{1,6})(?:\s|$)/.exec(nextLine.text)
    if (
      !nextHeadingMatch ||
      isInsideMarkdownCodeFence(state.doc.sliceString(0, nextLine.from)) ||
      nextHeadingMatch[1].length > headingLevel
    ) {
      continue
    }

    return nextLine.from - 1 > headingLine.to
      ? { from: headingLine.to, to: nextLine.from - 1 }
      : null
  }

  return headingLine.to < state.doc.length ? { from: headingLine.to, to: state.doc.length } : null
})

class FoldMarker extends GutterMarker {
  constructor(readonly open: boolean) {
    super()
  }

  eq(other: FoldMarker) {
    return this.open === other.open
  }

  toDOM() {
    const icon = document.createElement("span")
    icon.className = `cm-fold-marker ${this.open ? "is-open" : "is-closed"}`
    icon.innerHTML = this.open
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`
    return icon
  }
}

const openFoldMarker = new FoldMarker(true)
const closedFoldMarker = new FoldMarker(false)

/**
 * 忽略代码块及其内部所有行的左侧折叠栏。
 */
export const markdownFoldGutter = gutter({
  class: "cm-foldGutter",
  markers(view) {
    const builder = new RangeSetBuilder<GutterMarker>()
    for (const { from, to } of view.visibleRanges) {
      let pos = from
      while (pos <= to) {
        const line = view.state.doc.lineAt(pos)
        const prefix = view.state.doc.sliceString(0, line.from)
        const isFenceLine = /^\s*(`{3,}|~{3,})/.test(line.text)
        const isInsideFence = isInsideMarkdownCodeFence(prefix)

        if (!isFenceLine && !isInsideFence) {
          let isFolded = false
          foldedRanges(view.state).between(line.from, line.to, (fromPos) => {
            if (fromPos >= line.from && fromPos <= line.to) isFolded = true
          })

          if (isFolded) {
            builder.add(line.from, line.from, closedFoldMarker)
          } else if (foldable(view.state, line.from, line.to)) {
            builder.add(line.from, line.from, openFoldMarker)
          }
        }
        pos = line.to + 1
      }
    }
    return builder.finish()
  },
  initialSpacer() {
    return openFoldMarker
  },
  domEventHandlers: {
    click(view, lineBlock) {
      const docLine = view.state.doc.lineAt(lineBlock.from)
      const prefix = view.state.doc.sliceString(0, docLine.from)
      const isFenceLine = /^\s*(`{3,}|~{3,})/.test(docLine.text)
      const isInsideFence = isInsideMarkdownCodeFence(prefix)

      if (isFenceLine || isInsideFence) {
        return false
      }

      let folded = false
      foldedRanges(view.state).between(docLine.from, docLine.to, (from, to) => {
        if (from >= docLine.from && from <= docLine.to) {
          view.dispatch({ effects: unfoldEffect.of({ from, to }) })
          folded = true
        }
      })

      if (!folded) {
        const range = foldable(view.state, docLine.from, docLine.to)
        if (range) {
          view.dispatch({ effects: foldEffect.of(range) })
        }
      }
      return true
    },
  },
})
