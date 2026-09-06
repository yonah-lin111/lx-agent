import { type MutableRefObject, useRef } from "react"
import type { EditorView } from "@codemirror/view"
import type { Line } from "@codemirror/state"
import type { GitWorktreeEntry } from "@shared/contracts/git"
import { resolveGitWorktreeTarget } from "@/features/git"
import {
  cycleMarkdownTemplateStatus,
  getMarkdownSuppleBlockEndLine,
  getMarkdownTemplateBlockContent,
  getMarkdownTemplateBlockEndLine,
  getMarkdownTemplateBlockStartLine,
  isInsideMarkdownSuppleBlock,
  isInsideMarkdownTemplateBlock,
  setMarkdownSuppleWorktree,
  setMarkdownTemplateTitle,
  setMarkdownTemplateWorktree,
} from "@/features/markdown/commands/markdownBlockCommands"
import {
  getMarkdownSelectCommandValue,
  parseMarkdownSendPromptCommandLine,
  stripMarkdownSlashCommands,
} from "@/features/markdown/commands/markdownSlashCommands"
import { formatMarkdown, mapMarkdownPosition } from "@/features/markdown/extensions/markdownEditorExtensions"
import {
  stripEmptyTemplateItems,
  stripMarkdownSubblockFences,
  stripMarkdownTemplateComments,
} from "@/features/markdown/utils/markdownRenderer"
import { dispatchTemplatePrompt } from "@/features/markdown/utils/markdownSendPromptDispatcher"
import type { useTranslation } from "@/i18n"

// 模板块标题生成的加载占位文本（写入开始行「title: 」字段，兼作防重复触发与结果回写锚点）。
export const TEMPLATE_TITLE_LOADING_TEXT = "⏳ 正在生成标题…"
// /summaryTitle 裸命令文本（trim 匹配用）。
export const SUMMARY_COMMAND_TEXT = "/summaryTitle"

// 在文档中定位包含加载占位的行（即被写入「title: ⏳ 正在生成标题…」的开始行）；占位已消失时返回 null。
export const findTitleLoadingLine = (view: EditorView): Line | null => {
  const markerIndex = view.state.doc.toString().indexOf(TEMPLATE_TITLE_LOADING_TEXT)
  return markerIndex < 0 ? null : view.state.doc.lineAt(markerIndex)
}

export interface UseMarkdownActionsParams {
  editorViewRef: MutableRefObject<EditorView | null>
  projectPath?: string
  worktreePath?: string | null
  worktreesRef: MutableRefObject<GitWorktreeEntry[] | null>
  projectBranchRef: MutableRefObject<string | null>
  projectPathRef: MutableRefObject<string | undefined>
  onWorktreePathChangeRef: MutableRefObject<((path: string | null) => void | Promise<boolean>) | undefined>
  captureScrollAnchor: () => void
  t: ReturnType<typeof useTranslation>["t"]
  toast: {
    success: (message: string) => void
    warning: (message: string) => void
    error: (message: string) => void
  }
}

export interface UseMarkdownActionsReturn {
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
}

export const useMarkdownActions = ({
  editorViewRef,
  projectPath,
  worktreePath,
  worktreesRef,
  projectBranchRef,
  projectPathRef,
  onWorktreePathChangeRef,
  captureScrollAnchor,
  t,
  toast,
}: UseMarkdownActionsParams): UseMarkdownActionsReturn => {
  const isGeneratingTitleRef = useRef(false)

  const insertText = (text: string, selectionOffset = text.length): void => {
    const view = editorViewRef.current
    if (!view) return

    const { from, to } = view.state.selection.main
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + selectionOffset },
    })
    view.focus()
  }

  const wrapSelection = (prefix: string, suffix: string, placeholder: string): void => {
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
  }

  const insertCodeBlock = (): void => {
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
  }

  const formatDocument = (): void => {
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
  }

  const prefixLines = (prefix: string, placeholder: string): void => {
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
  }

  const addHeading = (level: number): void => {
    prefixLines(`${"#".repeat(level)} `, "Heading")
  }

  const cycleTemplateStatus = (line: number): void => {
    const view = editorViewRef.current
    if (!view) return

    const docLine = view.state.doc.line(line + 1)
    const nextLineText = cycleMarkdownTemplateStatus(docLine.text)
    if (nextLineText === null) return

    view.dispatch({ changes: { from: docLine.from, to: docLine.to, insert: nextLineText } })
  }

  const runTemplateTitleGeneration = (view: EditorView): void => {
    if (isGeneratingTitleRef.current) return
    const docText = view.state.doc.toString()
    const cursor = view.state.selection.main.head
    const blockContent = getMarkdownTemplateBlockContent(docText, cursor)
    if (blockContent === null) return

    const cleaned = stripEmptyTemplateItems(
      stripMarkdownTemplateComments(
        blockContent
          .split("\n")
          .filter((blockLine) => blockLine.trim() !== SUMMARY_COMMAND_TEXT)
          .join("\n"),
      ),
    )
    if (cleaned.trim() === "") {
      toast.warning("模板块内容为空，无法生成标题")
      return
    }

    const startLineNumber = getMarkdownTemplateBlockStartLine(docText, cursor)
    if (startLineNumber === null) return
    const startDocLine = view.state.doc.line(startLineNumber)
    const originalStartText = startDocLine.text

    isGeneratingTitleRef.current = true
    const changes: { from: number; to: number; insert: string }[] = [
      {
        from: startDocLine.from,
        to: startDocLine.to,
        insert: setMarkdownTemplateTitle(originalStartText, TEMPLATE_TITLE_LOADING_TEXT),
      },
    ]
    const commandLine = view.state.doc.lineAt(cursor)
    if (commandLine.text.trim() !== "") {
      changes.push({ from: commandLine.from, to: commandLine.to, insert: "" })
    }
    view.dispatch({ changes })
    view.focus()

    void window.api.markdown.generateTemplateTitle(cleaned).then(
      (title) => {
        isGeneratingTitleRef.current = false
        const currentView = editorViewRef.current
        if (!currentView) return
        const markerLine = findTitleLoadingLine(currentView)
        if (!markerLine) return

        if (title) {
          const nextStartText = setMarkdownTemplateTitle(markerLine.text, title)
          if (nextStartText !== markerLine.text) {
            currentView.dispatch({
              changes: { from: markerLine.from, to: markerLine.to, insert: nextStartText },
            })
          }
        } else {
          currentView.dispatch({
            changes: { from: markerLine.from, to: markerLine.to, insert: originalStartText },
          })
          toast.warning("标题生成失败，请检查模型配置后重试")
        }
        currentView.focus()
      },
      () => {
        isGeneratingTitleRef.current = false
        const currentView = editorViewRef.current
        if (!currentView) return
        const markerLine = findTitleLoadingLine(currentView)
        if (!markerLine) return

        currentView.dispatch({
          changes: { from: markerLine.from, to: markerLine.to, insert: originalStartText },
        })
        currentView.focus()
        toast.warning("标题生成失败，请检查模型配置后重试")
      },
    )
  }

  const runGitWorktreeSwitch = (view: EditorView): void => {
    const docText = view.state.doc.toString()
    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    const isInsideSupple = isInsideMarkdownSuppleBlock(view.state.doc.sliceString(0, line.from))
    const isInsideTemplate = isInsideMarkdownTemplateBlock(view.state.doc.sliceString(0, line.from))
    const isInsideAnyBlock = isInsideSupple || isInsideTemplate
    const branch = getMarkdownSelectCommandValue(line.text, isInsideAnyBlock)
    const currentProjectPath = projectPathRef.current
    if (branch === null || !currentProjectPath) return

    const target = resolveGitWorktreeTarget(
      branch,
      worktreesRef.current,
      currentProjectPath,
      projectBranchRef.current,
    )
    if (!target) {
      toast.error(`未找到工作区或分支：${branch}`)
      return
    }

    const clearCommandLine = (): void => {
      const commandLine = view.state.doc.lineAt(cursor)
      if (commandLine.text.trim() === "") return
      view.dispatch({
        changes: { from: commandLine.from, to: commandLine.to, insert: "" },
        selection: { anchor: commandLine.from },
      })
    }

    if (isInsideSupple) {
      const endLineNumber = getMarkdownSuppleBlockEndLine(docText, cursor)
      if (endLineNumber === null) {
        toast.error("未找到闭合的补充块结束行")
        return
      }
      const endDocLine = view.state.doc.line(endLineNumber)
      const nextEndText = setMarkdownSuppleWorktree(
        endDocLine.text,
        target.isDefault ? null : branch,
      )
      if (nextEndText !== endDocLine.text) {
        view.dispatch({
          changes: { from: endDocLine.from, to: endDocLine.to, insert: nextEndText },
        })
      }
      clearCommandLine()
      toast.success(target.isDefault ? "已恢复为继承外部工作区" : `补充块已绑定工作区 ${branch}`)
      view.focus()
      return
    }

    if (isInsideTemplate) {
      const endLineNumber = getMarkdownTemplateBlockEndLine(docText, cursor)
      if (endLineNumber === null) return
      const endDocLine = view.state.doc.line(endLineNumber)
      const nextEndText = setMarkdownTemplateWorktree(
        endDocLine.text,
        target.isDefault ? null : branch,
      )
      if (nextEndText !== endDocLine.text) {
        view.dispatch({
          changes: { from: endDocLine.from, to: endDocLine.to, insert: nextEndText },
        })
      }
      clearCommandLine()
      toast.success(target.isDefault ? "已切换回默认工作区" : `模板块已绑定工作区 ${branch}`)
      view.focus()
      return
    }

    clearCommandLine()
    const result = onWorktreePathChangeRef.current?.(target.isDefault ? null : target.path)
    if (result instanceof Promise) {
      void result.then(
        (persisted) => {
          if (persisted) {
            toast.success(target.isDefault ? "已切换回默认工作区" : `已切换到工作区 ${branch}`)
          } else {
            toast.error(`切换工作区失败：${branch}`)
          }
        },
        () => {
          toast.error(`切换工作区失败：${branch}`)
        },
      )
    } else {
      toast.success(target.isDefault ? "已切换回默认工作区" : `已切换到工作区 ${branch}`)
    }
    view.focus()
  }

  const runSendPromptDispatch = (view: EditorView): void => {
    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    const docText = view.state.doc.toString()
    const isInsideTemplate = isInsideMarkdownTemplateBlock(view.state.doc.sliceString(0, line.from))
    if (!isInsideTemplate) return

    const blockContent = getMarkdownTemplateBlockContent(docText, cursor)
    if (!blockContent) return

    const parsed = parseMarkdownSendPromptCommandLine(line.text)
    const rawTarget = parsed
      ? parsed.instance
        ? `${parsed.target}:${parsed.instance}`
        : parsed.target
      : getMarkdownSelectCommandValue(line.text, isInsideTemplate) || "agent"
    const autoEnter = parsed?.flag === "-enter"
    const cleanedPrompt = stripEmptyTemplateItems(
      stripMarkdownTemplateComments(
        stripMarkdownSlashCommands(stripMarkdownSubblockFences(blockContent)),
      ),
    ).trim()

    view.dispatch({
      changes: { from: line.from, to: line.to, insert: "" },
      selection: { anchor: line.from },
    })

    void dispatchTemplatePrompt(rawTarget, cleanedPrompt, {
      projectPath,
      worktreePath: worktreePath ?? undefined,
      autoEnter,
      t: t as any,
      showToast: {
        success: (msg) => toast.success(msg),
        error: (msg) => toast.error(msg),
      },
    })
    view.focus()
  }

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
  }
}
