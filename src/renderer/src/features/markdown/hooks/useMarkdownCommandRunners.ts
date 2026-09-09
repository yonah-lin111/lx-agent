import type { Line } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"
import type { GitWorktreeEntry } from "@shared/contracts/git"
import { useCallback, useRef } from "react"
import { resolveGitWorktreeTarget } from "@/features/git"
import {
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
import { stripMarkdownFrontmatter } from "@/features/markdown/commands/markdownVariableCommands"
import {
  stripEmptyTemplateItems,
  stripMarkdownSubblockFences,
  stripMarkdownTemplateComments,
} from "@/features/markdown/utils/markdownRenderer"
import { dispatchTemplatePrompt } from "@/features/markdown/utils/markdownSendPromptDispatcher"

import type { TranslationKey } from "@/i18n"

// 模板块标题生成的加载占位文本（写入开始行「title: 」字段，兼作防重复触发与结果回写锚点）。
const TEMPLATE_TITLE_LOADING_TEXT = "⏳ 正在生成标题…"
// /summaryTitle 裸命令文本（trim 匹配用）。
const SUMMARY_COMMAND_TEXT = "/summaryTitle"

// 在文档中定位包含加载占位的行（即被写入「title: ⏳ 正在生成标题…」的开始行）；占位已消失时返回 null。
const findTitleLoadingLine = (view: EditorView): Line | null => {
  const markerIndex = view.state.doc.toString().indexOf(TEMPLATE_TITLE_LOADING_TEXT)
  return markerIndex < 0 ? null : view.state.doc.lineAt(markerIndex)
}

export interface UseMarkdownCommandRunnersOptions {
  editorViewRef: React.RefObject<EditorView | null>
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

export interface UseMarkdownCommandRunnersResult {
  runTemplateTitleGeneration: (view: EditorView) => void
  runGitWorktreeSwitch: (view: EditorView) => void
  runSendPromptDispatch: (view: EditorView) => void
}

/**
 * 封装 Markdown 模板块高级命令执行逻辑（标题自动生成、Git 工作区切换、Prompt 派发）。
 */
export const useMarkdownCommandRunners = ({
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
}: UseMarkdownCommandRunnersOptions): UseMarkdownCommandRunnersResult => {
  const isGeneratingTitleRef = useRef(false)
  const worktreesRef = useRef(worktrees)
  const projectBranchRef = useRef(projectBranch)
  const projectPathRef = useRef(projectPath)
  const worktreePathRef = useRef(worktreePath)
  const onWorktreePathChangeRef = useRef(onWorktreePathChange)

  worktreesRef.current = worktrees
  projectBranchRef.current = projectBranch
  projectPathRef.current = projectPath
  worktreePathRef.current = worktreePath
  onWorktreePathChangeRef.current = onWorktreePathChange

  const runTemplateTitleGeneration = useCallback(
    (view: EditorView): void => {
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
        warning("模板块内容为空，无法生成标题")
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
            warning("标题生成失败，请检查模型配置后重试")
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
          warning("标题生成失败，请检查模型配置后重试")
        },
      )
    },
    [editorViewRef, warning],
  )

  const runGitWorktreeSwitch = useCallback(
    (view: EditorView): void => {
      const docText = view.state.doc.toString()
      const cursor = view.state.selection.main.head
      const line = view.state.doc.lineAt(cursor)
      const isInsideSupple = isInsideMarkdownSuppleBlock(view.state.doc.sliceString(0, line.from))
      const isInsideTemplate = isInsideMarkdownTemplateBlock(
        view.state.doc.sliceString(0, line.from),
      )
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
        error(`未找到工作区或分支：${branch}`)
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
          error("未找到闭合的补充块结束行")
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
        success(target.isDefault ? "已恢复为继承外部工作区" : `补充块已绑定工作区 ${branch}`)
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
        success(target.isDefault ? "已切换回默认工作区" : `模板块已绑定工作区 ${branch}`)
        view.focus()
        return
      }

      clearCommandLine()
      const result = onWorktreePathChangeRef.current?.(target.isDefault ? null : target.path)
      if (result instanceof Promise) {
        void result.then(
          (persisted) => {
            if (persisted) {
              success(target.isDefault ? "已切换回默认工作区" : `已切换到工作区 ${branch}`)
            } else {
              error(`切换工作区失败：${branch}`)
            }
          },
          () => {
            error(`切换工作区失败：${branch}`)
          },
        )
      } else {
        success(target.isDefault ? "已切换回默认工作区" : `已切换到工作区 ${branch}`)
      }
      view.focus()
    },
    [error, success],
  )

  const runSendPromptDispatch = useCallback(
    (view: EditorView): void => {
      const cursor = view.state.selection.main.head
      const line = view.state.doc.lineAt(cursor)
      const docText = view.state.doc.toString()
      const isInsideTemplate = isInsideMarkdownTemplateBlock(
        view.state.doc.sliceString(0, line.from),
      )
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
      const cleanedPrompt = stripMarkdownFrontmatter(
        stripEmptyTemplateItems(
          stripMarkdownTemplateComments(
            stripMarkdownSlashCommands(stripMarkdownSubblockFences(blockContent)),
          ),
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
        t: (k, opts) => t(k, opts as Record<string, string | number>),
        showToast: {
          success: (msg) => success(msg),
          error: (msg) => error(msg),
        },
      })
      view.focus()
    },
    [error, projectPath, success, t, worktreePath],
  )

  return {
    runTemplateTitleGeneration,
    runGitWorktreeSwitch,
    runSendPromptDispatch,
  }
}
