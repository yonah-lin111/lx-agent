import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view"
import {
  cycleMarkdownTemplateStatus,
  MARKDOWN_LOG_START_RE,
} from "@/features/markdown/commands/markdownBlockCommands"
import {
  cleanVarBlockItems,
  MARKDOWN_VAR_TEMPLATE_END_RE,
  MARKDOWN_VAR_TEMPLATE_START_RE,
  mergeMarkdownVarBlock,
  moveMarkdownVarBlockToTop,
} from "@/features/markdown/commands/markdownVariableCommands"
import { buildMarkdownMarkerDecorations } from "@/features/markdown/extensions/markerDecorations"
import { markdownBlockFoldToggleEffect } from "@/features/markdown/extensions/markerWidgets"
import { stripEmptyTemplateItems } from "@/features/markdown/utils/markdownRenderer"

// 标记插件弹窗提示接口。
export interface MarkdownMarkerToast {
  success?: (message: string) => void
  warning?: (message: string) => void
}

/**
 * 为不同 Markdown 标记添加独立颜色，弥补语法标签共用造成的辨识度不足。
 */
export const markdownMarkerHighlight = (
  showFolding = false,
  getReferencedProjectNames?: () => Set<string>,
  toast?: MarkdownMarkerToast,
  t?: (key: string) => string,
) => {
  const markerPlugin = ViewPlugin.fromClass(
    class {
      decorations: ReturnType<typeof buildMarkdownMarkerDecorations>
      foldedIndices = new Set<number>()
      templateFoldedIndices = new Set<number>()
      suppleFoldedIndices = new Set<number>()
      logFoldedIndices = new Set<number>()
      varFoldedIndices = new Set<number>()
      initialLogScanned = false
      wasComposing = false
      referencedNamesKey = ""

      constructor(view: EditorView) {
        this.scanInitialLogs(view)
        this.decorations = buildMarkdownMarkerDecorations(
          view,
          this.foldedIndices,
          (index) => this.toggleFold(view, index),
          this.templateFoldedIndices,
          (index) => this.toggleTemplateFold(view, index),
          (line) => this.cycleTemplateStatus(view, line),
          showFolding,
          getReferencedProjectNames,
          (startLine, endLine) => this.deleteTemplateBlock(view, startLine, endLine),
          (startLine, endLine) => this.cleanTemplateBlock(view, startLine, endLine),
          this.suppleFoldedIndices,
          (index) => this.toggleSuppleFold(view, index),
          (startLine, endLine) => this.deleteSuppleBlock(view, startLine, endLine),
          (startLine, endLine) => this.cleanSuppleBlock(view, startLine, endLine),
          this.logFoldedIndices,
          (index) => this.toggleLogFold(view, index),
          (startLine, endLine) => this.deleteLogBlock(view, startLine, endLine),
          (startLine, endLine) => this.cleanLogBlock(view, startLine, endLine),
          this.varFoldedIndices,
          (index) => this.toggleVarFold(view, index),
          (startLine, endLine) => this.deleteVarBlock(view, startLine, endLine),
          (startLine, endLine) => this.cleanVarBlock(view, startLine, endLine),
          (startLine, endLine) => this.mergeVarBlock(view, startLine, endLine),
          (startLine, endLine) => this.moveVarBlockToTop(view, startLine, endLine),
        )
      }

      scanInitialLogs(view: EditorView) {
        if (this.initialLogScanned) return
        this.initialLogScanned = true
        let logIndex = 0
        for (const line of view.state.doc.iterLines()) {
          if (MARKDOWN_LOG_START_RE.test(line)) {
            // 刷新页面或重新进入默认为折叠
            this.logFoldedIndices.add(logIndex++)
          }
        }
      }

      update(update: ViewUpdate): void {
        if (update.view.composing) {
          if (update.docChanged) this.decorations = this.decorations.map(update.changes)
          this.wasComposing = true
          return
        }

        let namesChanged = false
        if (getReferencedProjectNames) {
          const currentKey = [...getReferencedProjectNames()].sort().join("\u0000")
          namesChanged = currentKey !== this.referencedNamesKey
          this.referencedNamesKey = currentKey
        }

        const isFoldToggled = update.transactions.some((transaction) =>
          transaction.effects.some((effect) => effect.is(markdownBlockFoldToggleEffect)),
        )
        if (
          !update.docChanged &&
          !update.selectionSet &&
          !isFoldToggled &&
          !this.wasComposing &&
          !namesChanged
        )
          return

        this.wasComposing = false
        this.decorations = buildMarkdownMarkerDecorations(
          update.view,
          this.foldedIndices,
          (index) => this.toggleFold(update.view, index),
          this.templateFoldedIndices,
          (index) => this.toggleTemplateFold(update.view, index),
          (line) => this.cycleTemplateStatus(update.view, line),
          showFolding,
          getReferencedProjectNames,
          (startLine, endLine) => this.deleteTemplateBlock(update.view, startLine, endLine),
          (startLine, endLine) => this.cleanTemplateBlock(update.view, startLine, endLine),
          this.suppleFoldedIndices,
          (index) => this.toggleSuppleFold(update.view, index),
          (startLine, endLine) => this.deleteSuppleBlock(update.view, startLine, endLine),
          (startLine, endLine) => this.cleanSuppleBlock(update.view, startLine, endLine),
          this.logFoldedIndices,
          (index) => this.toggleLogFold(update.view, index),
          (startLine, endLine) => this.deleteLogBlock(update.view, startLine, endLine),
          (startLine, endLine) => this.cleanLogBlock(update.view, startLine, endLine),
          this.varFoldedIndices,
          (index) => this.toggleVarFold(update.view, index),
          (startLine, endLine) => this.deleteVarBlock(update.view, startLine, endLine),
          (startLine, endLine) => this.cleanVarBlock(update.view, startLine, endLine),
          (startLine, endLine) => this.mergeVarBlock(update.view, startLine, endLine),
          (startLine, endLine) => this.moveVarBlockToTop(update.view, startLine, endLine),
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

      toggleTemplateFold(view: EditorView, index: number) {
        if (this.templateFoldedIndices.has(index)) {
          this.templateFoldedIndices.delete(index)
        } else {
          this.templateFoldedIndices.add(index)
        }
        view.dispatch({ effects: markdownBlockFoldToggleEffect.of() })
      }

      toggleSuppleFold(view: EditorView, index: number) {
        if (this.suppleFoldedIndices.has(index)) {
          this.suppleFoldedIndices.delete(index)
        } else {
          this.suppleFoldedIndices.add(index)
        }
        view.dispatch({ effects: markdownBlockFoldToggleEffect.of() })
      }

      toggleLogFold(view: EditorView, index: number) {
        if (this.logFoldedIndices.has(index)) {
          this.logFoldedIndices.delete(index)
        } else {
          this.logFoldedIndices.add(index)
        }
        view.dispatch({ effects: markdownBlockFoldToggleEffect.of() })
      }

      cycleTemplateStatus(view: EditorView, line: number) {
        const docLine = view.state.doc.line(line + 1)
        const nextLineText = cycleMarkdownTemplateStatus(docLine.text)
        if (nextLineText === null) return

        view.dispatch({ changes: { from: docLine.from, to: docLine.to, insert: nextLineText } })
      }

      deleteTemplateBlock(view: EditorView, startLine: number, endLine: number) {
        const doc = view.state.doc
        const safeStartLine = Math.max(0, Math.min(startLine, doc.lines - 1))
        // 未闭合模板块（无结束行）视为延伸到文档末尾。
        const safeEndLine = endLine < startLine ? doc.lines - 1 : Math.min(endLine, doc.lines - 1)
        const startDocLine = doc.line(safeStartLine + 1)
        const endDocLine = doc.line(safeEndLine + 1)

        view.dispatch({
          changes: {
            from: startDocLine.from,
            to: Math.min(endDocLine.to + 1, doc.length),
          },
        })
      }

      cleanTemplateBlock(view: EditorView, startLine: number, endLine: number) {
        const doc = view.state.doc
        const safeEndLine = endLine < startLine ? doc.lines : endLine
        if (safeEndLine <= startLine + 1) return

        const innerLines: string[] = []
        for (let l = startLine + 1; l < safeEndLine; l++) {
          innerLines.push(doc.line(l + 1).text)
        }

        const cleaned = stripEmptyTemplateItems(innerLines.join("\n"), true)
        const firstInnerLine = doc.line(startLine + 2)
        const lastInnerLine = doc.line(safeEndLine)

        view.dispatch({
          changes: {
            from: firstInnerLine.from,
            to: lastInnerLine.to,
            insert: cleaned,
          },
        })
      }

      deleteSuppleBlock(view: EditorView, startLine: number, endLine: number) {
        const doc = view.state.doc
        const safeStartLine = Math.max(0, Math.min(startLine, doc.lines - 1))
        const safeEndLine = endLine < startLine ? doc.lines - 1 : Math.min(endLine, doc.lines - 1)
        const startDocLine = doc.line(safeStartLine + 1)
        const endDocLine = doc.line(safeEndLine + 1)

        view.dispatch({
          changes: {
            from: startDocLine.from,
            to: Math.min(endDocLine.to + 1, doc.length),
          },
        })
      }

      cleanSuppleBlock(view: EditorView, startLine: number, endLine: number) {
        const doc = view.state.doc
        const safeEndLine = endLine < startLine ? doc.lines : endLine
        if (safeEndLine <= startLine + 1) return

        const innerLines: string[] = []
        for (let l = startLine + 1; l < safeEndLine; l++) {
          innerLines.push(doc.line(l + 1).text)
        }

        const cleaned = stripEmptyTemplateItems(innerLines.join("\n"), false)
        const firstInnerLine = doc.line(startLine + 2)
        const lastInnerLine = doc.line(safeEndLine)

        view.dispatch({
          changes: {
            from: firstInnerLine.from,
            to: lastInnerLine.to,
            insert: cleaned,
          },
        })
      }

      deleteLogBlock(view: EditorView, startLine: number, endLine: number) {
        const doc = view.state.doc
        const safeStartLine = Math.max(0, Math.min(startLine, doc.lines - 1))
        const safeEndLine = endLine < startLine ? doc.lines - 1 : Math.min(endLine, doc.lines - 1)
        const startDocLine = doc.line(safeStartLine + 1)
        const endDocLine = doc.line(safeEndLine + 1)

        view.dispatch({
          changes: {
            from: startDocLine.from,
            to: Math.min(endDocLine.to + 1, doc.length),
          },
        })
      }

      cleanLogBlock(view: EditorView, startLine: number, endLine: number) {
        const doc = view.state.doc
        const safeEndLine = endLine < startLine ? doc.lines : endLine
        if (safeEndLine <= startLine + 1) return

        const innerLines: string[] = []
        for (let l = startLine + 1; l < safeEndLine; l++) {
          innerLines.push(doc.line(l + 1).text)
        }

        const cleaned = stripEmptyTemplateItems(innerLines.join("\n"), false)
        const firstInnerLine = doc.line(startLine + 2)
        const lastInnerLine = doc.line(safeEndLine)

        view.dispatch({
          changes: {
            from: firstInnerLine.from,
            to: lastInnerLine.to,
            insert: cleaned,
          },
        })
      }

      toggleVarFold(view: EditorView, index: number) {
        if (this.varFoldedIndices.has(index)) {
          this.varFoldedIndices.delete(index)
        } else {
          this.varFoldedIndices.add(index)
        }
        view.dispatch({ effects: markdownBlockFoldToggleEffect.of() })
      }

      deleteVarBlock(view: EditorView, startLine: number, endLine: number) {
        const doc = view.state.doc
        const safeStartLine = Math.max(0, Math.min(startLine, doc.lines - 1))
        const safeEndLine = endLine < startLine ? doc.lines - 1 : Math.min(endLine, doc.lines - 1)
        const startDocLine = doc.line(safeStartLine + 1)
        const endDocLine = doc.line(safeEndLine + 1)

        view.dispatch({
          changes: {
            from: startDocLine.from,
            to: Math.min(endDocLine.to + 1, doc.length),
          },
        })
      }

      cleanVarBlock(view: EditorView, startLine: number, endLine: number) {
        const doc = view.state.doc
        const safeEndLine = endLine < startLine ? doc.lines : endLine
        if (safeEndLine <= startLine + 1) return

        const innerLines: string[] = []
        for (let l = startLine + 1; l < safeEndLine; l++) {
          innerLines.push(doc.line(l + 1).text)
        }

        const cleaned = cleanVarBlockItems(innerLines.join("\n"))
        const firstInnerLine = doc.line(startLine + 2)
        const lastInnerLine = doc.line(safeEndLine)

        view.dispatch({
          changes: {
            from: firstInnerLine.from,
            to: lastInnerLine.to,
            insert: cleaned,
          },
        })
      }

      mergeVarBlock(view: EditorView, startLine: number, endLine: number) {
        const result = mergeMarkdownVarBlock(view.state.doc, startLine, endLine)
        if (result.isAlreadyTop) {
          toast?.warning?.(t?.("markdown.varBlockAlreadyAtTop") ?? "当前变量模板块已在最顶部")
          return
        }
        if (result.success && result.changes) {
          view.dispatch({ changes: result.changes })
          toast?.success?.(t?.("markdown.varBlockMerged") ?? "已合并到顶部变量模板块")
        }
      }

      moveVarBlockToTop(view: EditorView, startLine: number, endLine: number) {
        const result = moveMarkdownVarBlockToTop(view.state.doc, startLine, endLine)
        if (result.isAlreadyTop) {
          toast?.warning?.(t?.("markdown.varBlockAlreadyAtTop") ?? "当前变量模板块已在最顶部")
          return
        }
        if (result.success && result.changes) {
          view.dispatch({ changes: result.changes })
          toast?.success?.(t?.("markdown.varBlockMovedToTop") ?? "已将变量模板块调整到顶部")
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )

  return [markerPlugin]
}
