import type { EditorView } from "@codemirror/view"
import type { GitWorktreeEntry } from "@shared/contracts/git"
import { useCallback } from "react"
import { cycleMarkdownTemplateStatus } from "@/features/markdown/commands/markdownBlockCommands"
import {
  formatMarkdown,
  mapMarkdownPosition,
} from "@/features/markdown/extensions/markdownEditorExtensions"
import { flashLineEffect } from "@/features/markdown/extensions/markdownFlashLine"
import { useMarkdownCommandRunners } from "@/features/markdown/hooks/useMarkdownCommandRunners"
import type { TranslationKey } from "@/i18n"

export interface UseMarkdownEditorActionsOptions {
  editorViewRef: React.RefObject<EditorView | null>
  previewRef: React.RefObject<HTMLElement | null>
  captureScrollAnchor: () => void
  projectPath?: string
  worktreePath?: string | null
  onWorktreePathChange?: (path: string | null) => void | Promise<boolean>
  worktrees: GitWorktreeEntry[] | null
  projectBranch: string | null
  success: (msg: string) => void
  warning: (msg: string) => void
  error: (msg: string) => void
  t: (key: TranslationKey, options?: Record<string, string | number>) => string
}

export interface UseMarkdownEditorActionsResult {
  insertText: (text: string, selectionOffset?: number) => void
  wrapSelection: (prefix: string, suffix: string, placeholder: string) => void
  insertCodeBlock: () => void
  formatDocument: () => void
  prefixLines: (prefix: string, placeholder: string) => void
  addHeading: (level: number) => void
  cycleTemplateStatus: (line: number) => void
  runTemplateTitleGeneration: (view: EditorView) => void
  runGitWorktreeSwitch: (view: EditorView) => void
  runSendPromptDispatch: (view: EditorView) => void
  scrollToBottom: () => void
  scrollToLine: (line: number) => void
}

/**
 * 封装 Markdown 编辑器文本格式化、选区修改、模板动作与工作区切换等操作。
 */
export const useMarkdownEditorActions = ({
  editorViewRef,
  previewRef,
  captureScrollAnchor,
  projectPath,
  worktreePath,
  onWorktreePathChange,
  worktrees,
  projectBranch,
  success,
  warning,
  error,
  t,
}: UseMarkdownEditorActionsOptions): UseMarkdownEditorActionsResult => {
  const { runTemplateTitleGeneration, runGitWorktreeSwitch, runSendPromptDispatch } =
    useMarkdownCommandRunners({
      editorViewRef,
      projectPath,
      worktreePath,
      onWorktreePathChange,
      worktrees,
      projectBranch,
      success,
      warning,
      error,
      t,
    })

  const insertText = useCallback(
    (text: string, selectionOffset = text.length): void => {
      const view = editorViewRef.current
      if (!view) return

      const { from, to } = view.state.selection.main
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + selectionOffset },
      })
      view.focus()
    },
    [editorViewRef],
  )

  const wrapSelection = useCallback(
    (prefix: string, suffix: string, placeholder: string): void => {
      const view = editorViewRef.current
      if (!view) return

      const { from, to } = view.state.selection.main
      const selectedText = view.state.doc.sliceString(from, to)
      const innerText = selectedText || placeholder
      const insert = `${prefix}${innerText}${suffix}`
      view.dispatch({
        changes: { from, to, insert },
        selection: selectedText
          ? { anchor: from + prefix.length, head: from + prefix.length + innerText.length }
          : { anchor: from + prefix.length, head: from + prefix.length + placeholder.length },
      })
      view.focus()
    },
    [editorViewRef],
  )

  const insertCodeBlock = useCallback((): void => {
    const view = editorViewRef.current
    if (!view) return

    const { from, to } = view.state.selection.main
    const selectedText = view.state.doc.sliceString(from, to)

    if (selectedText) {
      const insert = `\`\`\`\n${selectedText}\n\`\`\``
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + 4, head: from + 4 + selectedText.length },
      })
    } else {
      const insert = "```language\n```"
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + 3, head: from + 11 },
      })
    }
    view.focus()
  }, [editorViewRef])

  const formatDocument = useCallback((): void => {
    const view = editorViewRef.current
    if (!view) return

    const sourceContent = view.state.doc.toString()
    captureScrollAnchor()
    const formattedContent = formatMarkdown(sourceContent)
    if (formattedContent === sourceContent) return

    const selection = view.state.selection.main
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: formattedContent },
      selection: {
        anchor: mapMarkdownPosition(sourceContent, formattedContent, selection.anchor),
        head: mapMarkdownPosition(sourceContent, formattedContent, selection.head),
      },
    })
    view.focus()
  }, [editorViewRef, captureScrollAnchor])

  const prefixLines = useCallback(
    (prefix: string, placeholder: string): void => {
      const view = editorViewRef.current
      if (!view) return

      const { from, to } = view.state.selection.main
      const selectedText = view.state.doc.sliceString(from, to)
      const insert = selectedText
        ? `${prefix}${selectedText.replaceAll("\n", `\n${prefix}`)}`
        : `${prefix}${placeholder}`
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + prefix.length, head: from + insert.length },
      })
      view.focus()
    },
    [editorViewRef],
  )

  const addHeading = useCallback(
    (level: number): void => {
      prefixLines(`${"#".repeat(level)} `, "Heading")
    },
    [prefixLines],
  )

  const cycleTemplateStatus = useCallback(
    (line: number): void => {
      const view = editorViewRef.current
      if (!view) return

      const docLine = view.state.doc.line(line + 1)
      const nextLineText = cycleMarkdownTemplateStatus(docLine.text)
      if (nextLineText === null) return

      view.dispatch({ changes: { from: docLine.from, to: docLine.to, insert: nextLineText } })
    },
    [editorViewRef],
  )

  const scrollToBottom = useCallback((): void => {
    const view = editorViewRef.current
    if (!view) return
    const docLength = view.state.doc.length
    view.dispatch({
      selection: { anchor: docLength },
      scrollIntoView: true,
    })
    requestAnimationFrame(() => {
      if (editorViewRef.current) {
        editorViewRef.current.scrollDOM.scrollTop = editorViewRef.current.scrollDOM.scrollHeight
      }
      if (previewRef.current) {
        previewRef.current.scrollTop = previewRef.current.scrollHeight
      }
    })
  }, [editorViewRef, previewRef])

  const scrollToLine = useCallback(
    (line: number): void => {
      const view = editorViewRef.current
      if (!view) return
      try {
        const docLines = view.state.doc.lines
        const safeLine = Math.max(1, Math.min(line, docLines))
        const lineInfo = view.state.doc.line(safeLine)

        view.dispatch({
          selection: { anchor: lineInfo.from },
          effects: flashLineEffect.of({ line: safeLine }),
        })

        const block = view.lineBlockAt(lineInfo.from)
        const containerHeight = view.scrollDOM.clientHeight
        const targetScrollTop = Math.max(0, block.top - containerHeight * 0.3)

        view.scrollDOM.scrollTo({
          top: targetScrollTop,
          behavior: "auto",
        })

        view.focus()
      } catch (e) {
        console.error("Failed to scroll to line", line, e)
      }
    },
    [editorViewRef],
  )

  return {
    insertText,
    wrapSelection,
    insertCodeBlock,
    formatDocument,
    prefixLines,
    addHeading,
    cycleTemplateStatus,
    runTemplateTitleGeneration,
    runGitWorktreeSwitch,
    runSendPromptDispatch,
    scrollToBottom,
    scrollToLine,
  }
}
