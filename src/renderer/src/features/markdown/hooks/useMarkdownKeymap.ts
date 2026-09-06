import { type MutableRefObject, useEffect } from "react"
import {
  deleteLine,
  historyKeymap,
  indentLess,
  indentMore,
  standardKeymap,
} from "@codemirror/commands"
import type { KeyBinding } from "@codemirror/view"
import type { EditorView } from "@codemirror/view"
import {
  cycleMarkdownTemplateStatus,
  getMarkdownTemplateBlockCopyText,
  getMarkdownTemplateBlockEndLine,
  isInsideMarkdownSuppleBlock,
  isInsideMarkdownTemplateBlock,
  toggleMarkdownTemplateCommentLines,
} from "@/features/markdown/commands/markdownBlockCommands"
import { getMarkdownArmedSlashCommand } from "@/features/markdown/commands/markdownSlashCommands"
import {
  createMarkdownTable,
  selectAllPreservingScrollPosition,
} from "@/features/markdown/extensions/markdownEditorExtensions"
import type { MarkdownPage, MarkdownPreviewMode } from "@/features/markdown/types"
import type { useTranslation } from "@/i18n"

export interface MarkdownEditorKeymapContext {
  pasteReferencePanelRef: MutableRefObject<any>
  activePasteReferenceIndexRef: MutableRefObject<number>
  fileMentionPanelRef: MutableRefObject<any>
  activeFileMentionIndexRef: MutableRefObject<number>
  gitWorktreePanelRef: MutableRefObject<any>
  activeGitWorktreeIndexRef: MutableRefObject<number>
  sendPromptPanelRef: MutableRefObject<any>
  activeSendPromptIndexRef: MutableRefObject<number>
  sendPromptFlagPanelRef: MutableRefObject<any>
  activeSendPromptFlagIndexRef: MutableRefObject<number>
  slashCommandPanelRef: MutableRefObject<any>
  activeSlashCommandIndexRef: MutableRefObject<number>
  blockCommandPanelRef: MutableRefObject<any>
  activeBlockCommandIndexRef: MutableRefObject<number>
  templateFilePanelRef: MutableRefObject<any>
  activeTemplateFileIndexRef: MutableRefObject<number>

  handlePasteReferenceKey: (offset: number) => boolean
  selectPasteReference: (mode: "reference" | "path") => boolean
  closePasteReferencePanel: (restore?: boolean) => void

  handleFileMentionKey: (key: "ArrowDown" | "ArrowUp") => boolean
  selectFileMention: (file: any) => void
  closeFileMentionPanel: () => void

  handleGitWorktreeKey: (offset: number) => boolean
  selectGitWorktree: (option: any) => void
  closeGitWorktreePanel: () => void

  handleSendPromptKey: (offset: number) => boolean
  selectSendPrompt: (option: any, split?: "auto" | "horizontal" | "vertical" | "tab") => void
  closeSendPromptPanel: () => void

  handleSendPromptFlagKey: (offset: number) => boolean
  selectSendPromptFlag: (option: any) => void
  closeSendPromptFlagPanel: () => void

  handleSlashCommandKey: (offset: number) => boolean
  selectSlashCommand: (command: any) => void
  closeSlashCommandPanel: () => void

  handleBlockCommandKey: (offset: number) => boolean
  selectBlockCommand: (command: any) => void
  setBlockCommandPanel: (panel: any) => void

  handleTemplateFileKey: (offset: number) => boolean
  selectTemplateFile: (file: any) => void
  closeTemplateFilePanel: () => void

  formattedCustomSlashCommands: any[]

  runSendPromptDispatch: (view: EditorView) => void
  runGitWorktreeSwitch: (view: EditorView) => void
  runTemplateTitleGeneration: (view: EditorView) => void

  insertText: (text: string, selectionOffset?: number) => void
  wrapSelection: (prefix: string, suffix: string, placeholder: string) => void
  insertCodeBlock: () => void
  formatDocument: () => void
  prefixLines: (prefix: string, placeholder: string) => void
  addHeading: (level: number) => void
  onSaveRef: MutableRefObject<(() => void) | undefined>
  showToastSuccess: (msg: string) => void
  t: ReturnType<typeof useTranslation>["t"]
}

export const buildMarkdownEditorPrecKeymap = (ctx: MarkdownEditorKeymapContext): KeyBinding[] => {
  return [
    {
      key: "ArrowDown",
      run: () =>
        ctx.handlePasteReferenceKey(1) ||
        ctx.handleFileMentionKey("ArrowDown") ||
        ctx.handleGitWorktreeKey(1) ||
        ctx.handleSendPromptKey(1) ||
        ctx.handleSendPromptFlagKey(1) ||
        ctx.handleSlashCommandKey(1) ||
        ctx.handleBlockCommandKey(1) ||
        ctx.handleTemplateFileKey(1),
    },
    {
      key: "ArrowUp",
      run: () =>
        ctx.handlePasteReferenceKey(-1) ||
        ctx.handleFileMentionKey("ArrowUp") ||
        ctx.handleGitWorktreeKey(-1) ||
        ctx.handleSendPromptKey(-1) ||
        ctx.handleSendPromptFlagKey(-1) ||
        ctx.handleSlashCommandKey(-1) ||
        ctx.handleBlockCommandKey(-1) ||
        ctx.handleTemplateFileKey(-1),
    },
    {
      key: "Enter",
      run: (view) => {
        const pastePanel = ctx.pasteReferencePanelRef.current
        if (pastePanel) {
          return ctx.selectPasteReference(
            ctx.activePasteReferenceIndexRef.current === 0 ? "reference" : "path",
          )
        }

        const fileMention = ctx.fileMentionPanelRef.current
        if (fileMention) {
          ctx.selectFileMention(
            fileMention.files[ctx.activeFileMentionIndexRef.current] ?? fileMention.files[0],
          )
          return true
        }

        const gitWorktree = ctx.gitWorktreePanelRef.current
        if (gitWorktree) {
          ctx.selectGitWorktree(
            gitWorktree.options[ctx.activeGitWorktreeIndexRef.current] ??
              gitWorktree.options[0],
          )
          return true
        }

        const sendPrompt = ctx.sendPromptPanelRef.current
        if (sendPrompt) {
          ctx.selectSendPrompt(
            sendPrompt.options[ctx.activeSendPromptIndexRef.current] ?? sendPrompt.options[0],
            "auto",
          )
          return true
        }

        const sendPromptFlag = ctx.sendPromptFlagPanelRef.current
        if (sendPromptFlag) {
          ctx.selectSendPromptFlag(
            sendPromptFlag.options[ctx.activeSendPromptFlagIndexRef.current] ??
              sendPromptFlag.options[0],
          )
          return true
        }

        const slashCommand = ctx.slashCommandPanelRef.current
        if (slashCommand) {
          ctx.selectSlashCommand(
            slashCommand.commands[ctx.activeSlashCommandIndexRef.current] ??
              slashCommand.commands[0],
          )
          return true
        }

        const panel = ctx.blockCommandPanelRef.current
        if (panel) {
          ctx.selectBlockCommand(
            panel.commands[ctx.activeBlockCommandIndexRef.current] ?? panel.commands[0],
          )
          return true
        }

        const templateFilePanel = ctx.templateFilePanelRef.current
        if (templateFilePanel) {
          ctx.selectTemplateFile(
            templateFilePanel.files[ctx.activeTemplateFileIndexRef.current] ??
              templateFilePanel.files[0],
          )
          return true
        }

        const cursor = view.state.selection.main.head
        const line = view.state.doc.lineAt(cursor)
        const isInsideSupple = isInsideMarkdownSuppleBlock(
          view.state.doc.sliceString(0, line.from),
        )
        const isInsideTemplate = isInsideMarkdownTemplateBlock(
          view.state.doc.sliceString(0, line.from),
        )
        const isInsideAnyBlock = isInsideSupple || isInsideTemplate

        // 二次回车命令：模板块内 /summaryTitle 命令行触发标题生成；/gitWorktree 命令行触发工作区切换；/sendPrompt 触发 Prompt 派发。
        const armedCommand = getMarkdownArmedSlashCommand(
          line.text,
          isInsideAnyBlock,
          ctx.formattedCustomSlashCommands,
        )
        if (armedCommand) {
          if (armedCommand.id === "sendPrompt") {
            ctx.runSendPromptDispatch(view)
          } else if (armedCommand.kind === "select") {
            ctx.runGitWorktreeSwitch(view)
          } else {
            ctx.runTemplateTitleGeneration(view)
          }
          return true
        }
        const templateEndMatch =
          /^(\s*)&&&(?:\s+(?:[A-Za-z]\w*)\s+--end|\s+--end)?(?:\s+(?:done|in_progress))?(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$/.exec(
            line.text,
          )
        if (cursor === line.to && templateEndMatch && isInsideTemplate) {
          const currentIndent = templateEndMatch[1] ?? ""
          const insertText = `\n${currentIndent}`
          view.dispatch({
            changes: { from: cursor, to: cursor, insert: insertText },
            selection: { anchor: cursor + insertText.length },
          })
          return true
        }

        const emptyListMarkerRegex = /^(\s*)([-+*](\s+\[[ xX]\])?|\d+[.)]|>)\s*$/
        if (emptyListMarkerRegex.test(line.text)) {
          view.dispatch({
            changes: { from: line.from, to: line.to, insert: "" },
            selection: { anchor: line.from },
          })
          return true
        }

        if (cursor > 0 && cursor < view.state.doc.length) {
          const prevChar = view.state.doc.sliceString(cursor - 1, cursor)
          const nextChar = view.state.doc.sliceString(cursor, cursor + 1)
          if (
            (prevChar === "{" && nextChar === "}") ||
            (prevChar === "[" && nextChar === "]") ||
            (prevChar === "(" && nextChar === ")")
          ) {
            const indentMatch = line.text.match(/^(\s*)/)
            const currentIndent = indentMatch ? indentMatch[1] : ""
            const insertText = `\n${currentIndent}  \n${currentIndent}`
            view.dispatch({
              changes: { from: cursor, to: cursor, insert: insertText },
              selection: { anchor: cursor + 1 + currentIndent.length + 2 },
            })
            return true
          }
        }

        return false
      },
    },
    {
      key: "Mod-d",
      run: () => {
        const sendPrompt = ctx.sendPromptPanelRef.current
        if (sendPrompt) {
          ctx.selectSendPrompt(
            sendPrompt.options[ctx.activeSendPromptIndexRef.current] ?? sendPrompt.options[0],
            "horizontal",
          )
          return true
        }
        return false
      },
    },
    {
      key: "Mod-Shift-d",
      run: () => {
        const sendPrompt = ctx.sendPromptPanelRef.current
        if (sendPrompt) {
          ctx.selectSendPrompt(
            sendPrompt.options[ctx.activeSendPromptIndexRef.current] ?? sendPrompt.options[0],
            "vertical",
          )
          return true
        }
        return false
      },
    },
    {
      key: "Mod-t",
      run: () => {
        const sendPrompt = ctx.sendPromptPanelRef.current
        if (sendPrompt) {
          ctx.selectSendPrompt(
            sendPrompt.options[ctx.activeSendPromptIndexRef.current] ?? sendPrompt.options[0],
            "tab",
          )
          return true
        }
        return false
      },
    },
    {
      key: "Escape",
      run: () => {
        if (ctx.pasteReferencePanelRef.current) {
          ctx.closePasteReferencePanel()
          return true
        }
        if (ctx.fileMentionPanelRef.current) {
          ctx.closeFileMentionPanel()
          return true
        }
        if (ctx.slashCommandPanelRef.current) {
          ctx.closeSlashCommandPanel()
          return true
        }
        if (ctx.gitWorktreePanelRef.current) {
          ctx.closeGitWorktreePanel()
          return true
        }
        if (ctx.sendPromptPanelRef.current) {
          ctx.closeSendPromptPanel()
          return true
        }
        if (ctx.sendPromptFlagPanelRef.current) {
          ctx.closeSendPromptFlagPanel()
          return true
        }
        if (ctx.blockCommandPanelRef.current) {
          ctx.blockCommandPanelRef.current = null
          ctx.setBlockCommandPanel(null)
          return true
        }
        if (ctx.templateFilePanelRef.current) {
          ctx.closeTemplateFilePanel()
          return true
        }
        return false
      },
    },
  ]
}

export const buildMarkdownEditorStandardKeymap = (
  ctx: MarkdownEditorKeymapContext,
): KeyBinding[] => {
  return [
    {
      key: "Ctrl-Shift-Enter",
      run: (view) => {
        const cursor = view.state.selection.main.head
        const line = view.state.doc.lineAt(cursor)
        const indentMatch = line.text.match(/^(\s*)/)
        const currentIndent = indentMatch ? indentMatch[1] : ""
        const insertText = `\n${currentIndent}`
        view.dispatch({
          changes: { from: line.to, to: line.to, insert: insertText },
          selection: { anchor: line.to + insertText.length },
        })
        return true
      },
    },
    {
      key: "Cmd-Shift-Enter",
      run: (view) => {
        const cursor = view.state.selection.main.head
        const line = view.state.doc.lineAt(cursor)
        const indentMatch = line.text.match(/^(\s*)/)
        const currentIndent = indentMatch ? indentMatch[1] : ""
        const insertText = `\n${currentIndent}`
        view.dispatch({
          changes: { from: line.to, to: line.to, insert: insertText },
          selection: { anchor: line.to + insertText.length },
        })
        return true
      },
    },
    { key: "Mod-a", run: selectAllPreservingScrollPosition },
    {
      key: "Mod-s",
      run: () => {
        ctx.onSaveRef.current?.()
        return true
      },
    },
    { key: "Tab", run: indentMore },
    {
      key: "Shift-Tab",
      run: (view) => {
        const docText = view.state.doc.toString()
        const cursor = view.state.selection.main.head
        const endLineNumber = getMarkdownTemplateBlockEndLine(docText, cursor)
        if (endLineNumber !== null) {
          const docLine = view.state.doc.line(endLineNumber)
          const nextLineText = cycleMarkdownTemplateStatus(docLine.text)
          if (nextLineText !== null) {
            view.dispatch({
              changes: { from: docLine.from, to: docLine.to, insert: nextLineText },
            })
            return true
          }
        }
        return indentLess(view)
      },
    },
    { key: "Mod-d", run: deleteLine },
    { key: "Mod-Alt-k", mac: "Cmd-Alt-k", run: () => (ctx.insertCodeBlock(), true) },
    { key: "Mod-Alt-K", mac: "Cmd-Alt-K", run: () => (ctx.insertCodeBlock(), true) },
    {
      key: "Mod-/",
      run: (view) => {
        const selection = view.state.selection.main
        const prefixFrom = view.state.doc.sliceString(0, selection.from)
        const prefixTo = view.state.doc.sliceString(0, selection.to)
        if (
          !isInsideMarkdownTemplateBlock(prefixFrom) ||
          !isInsideMarkdownTemplateBlock(prefixTo)
        ) {
          return false
        }
        const lineFrom = view.state.doc.lineAt(selection.from).from
        const lineTo = view.state.doc.lineAt(selection.to).to
        const rangeText = view.state.doc.sliceString(lineFrom, lineTo)
        const nextText = toggleMarkdownTemplateCommentLines(rangeText)
        if (nextText === rangeText) return false
        view.dispatch({ changes: { from: lineFrom, to: lineTo, insert: nextText } })
        return true
      },
    },
    { key: "Mod-b", run: () => (ctx.wrapSelection("**", "**", "bold"), true) },
    { key: "Mod-i", run: () => (ctx.wrapSelection("_", "_", "italic"), true) },
    { key: "Mod-1", run: () => (ctx.addHeading(1), true) },
    { key: "Mod-2", run: () => (ctx.addHeading(2), true) },
    { key: "Mod-3", run: () => (ctx.addHeading(3), true) },
    { key: "Mod-4", run: () => (ctx.addHeading(4), true) },
    { key: "Mod-5", run: () => (ctx.addHeading(5), true) },
    { key: "Mod-6", run: () => (ctx.addHeading(6), true) },
    { key: "Mod-o", run: () => (ctx.prefixLines("1. ", "Item"), true) },
    { key: "Mod-l", run: () => (ctx.wrapSelection("[", "](https://)", "link text"), true) },
    {
      key: "Mod-Shift-s",
      mac: "Cmd-Shift-s",
      run: () => (ctx.wrapSelection("~~", "~~", "strikethrough"), true),
    },
    {
      key: "Mod-Shift-S",
      mac: "Cmd-Shift-S",
      run: () => (ctx.wrapSelection("~~", "~~", "strikethrough"), true),
    },
    {
      key: "Mod-Shift-c",
      mac: "Cmd-Shift-c",
      run: (view) => {
        const docText = view.state.doc.toString()
        const cursor = view.state.selection.main.head
        const copyText = getMarkdownTemplateBlockCopyText(docText, cursor)
        if (copyText === null) return false
        void navigator.clipboard.writeText(copyText).then(() => {
          ctx.showToastSuccess(ctx.t("markdown.copiedCode"))
        })
        return true
      },
    },
    {
      key: "Mod-Shift-C",
      mac: "Cmd-Shift-C",
      run: (view) => {
        const docText = view.state.doc.toString()
        const cursor = view.state.selection.main.head
        const copyText = getMarkdownTemplateBlockCopyText(docText, cursor)
        if (copyText === null) return false
        void navigator.clipboard.writeText(copyText).then(() => {
          ctx.showToastSuccess(ctx.t("markdown.copiedCode"))
        })
        return true
      },
    },
    { key: "Mod-Shift-u", mac: "Cmd-Shift-u", run: () => (ctx.prefixLines("- ", "Item"), true) },
    { key: "Mod-Shift-U", mac: "Cmd-Shift-U", run: () => (ctx.prefixLines("- ", "Item"), true) },
    { key: "Mod-Shift-8", mac: "Cmd-Shift-8", run: () => (ctx.prefixLines("1. ", "Item"), true) },
    { key: "Mod-Shift-9", mac: "Cmd-Shift-9", run: () => (ctx.prefixLines("- ", "Item"), true) },
    {
      key: "Mod-Alt-c",
      mac: "Cmd-Alt-c",
      run: () => (ctx.wrapSelection("`", "`", "code"), true),
    },
    {
      key: "Mod-Alt-C",
      mac: "Cmd-Alt-C",
      run: () => (ctx.wrapSelection("`", "`", "code"), true),
    },
    {
      key: "Mod-Shift-Alt-t",
      mac: "Cmd-Shift-Alt-t",
      run: () => (ctx.insertText(createMarkdownTable({ columns: 2, rows: 2 })), true),
    },
    {
      key: "Mod-Shift-Alt-T",
      mac: "Cmd-Shift-Alt-T",
      run: () => (ctx.insertText(createMarkdownTable({ columns: 2, rows: 2 })), true),
    },
    { key: "Mod-Shift-f", mac: "Cmd-Shift-f", run: () => (ctx.formatDocument(), true) },
    { key: "Mod-Shift-F", mac: "Cmd-Shift-F", run: () => (ctx.formatDocument(), true) },
    ...historyKeymap,
    ...standardKeymap,
  ]
}

export interface UseMarkdownGlobalShortcutsParams {
  previewModeRef: MutableRefObject<MarkdownPreviewMode>
  isRightSidebarCollapsedRef: MutableRefObject<boolean>
  pageModeRef: MutableRefObject<boolean>
  pagesRef: MutableRefObject<MarkdownPage[] | undefined>
  activePageIndexRef: MutableRefObject<number>
  changePreviewMode: (mode: MarkdownPreviewMode) => void
  switchPageRef: MutableRefObject<(index: number) => void>
  createPageRef: MutableRefObject<() => void>
  onEmptyPageWarning: () => void
}

export const useMarkdownGlobalShortcuts = ({
  previewModeRef,
  isRightSidebarCollapsedRef,
  pageModeRef,
  pagesRef,
  activePageIndexRef,
  changePreviewMode,
  switchPageRef,
  createPageRef,
  onEmptyPageWarning,
}: UseMarkdownGlobalShortcutsParams): void => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const isModKey = event.metaKey || event.ctrlKey
      const isShift = event.shiftKey

      if (isModKey && isShift) {
        const key = event.key.toLowerCase()
        if (key === "e") {
          if (isRightSidebarCollapsedRef.current) {
            event.preventDefault()
            const currentMode = previewModeRef.current
            changePreviewMode(currentMode === "split" ? "edit" : "split")
          }
        } else if (key === "v") {
          event.preventDefault()
          const currentMode = previewModeRef.current
          changePreviewMode(currentMode === "preview" ? "edit" : "preview")
        }
        return
      }

      if (isModKey && event.altKey) {
        const key = event.key
        if (key !== "ArrowLeft" && key !== "ArrowRight") return
        event.preventDefault()
        if (!pageModeRef.current || !pagesRef.current?.length) return
        const currentIndex = activePageIndexRef.current

        if (key === "ArrowLeft") {
          switchPageRef.current(currentIndex - 1)
          return
        }

        if (currentIndex < pagesRef.current.length - 1) {
          switchPageRef.current(currentIndex + 1)
          return
        }

        const currentPage = pagesRef.current[currentIndex]
        if (currentPage && currentPage.content.trim() === "") {
          onEmptyPageWarning()
          return
        }
        createPageRef.current()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [
    activePageIndexRef,
    changePreviewMode,
    createPageRef,
    isRightSidebarCollapsedRef,
    onEmptyPageWarning,
    pageModeRef,
    pagesRef,
    previewModeRef,
    switchPageRef,
  ])
}
