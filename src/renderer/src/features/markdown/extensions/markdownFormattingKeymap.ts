import {
  deleteLine,
  historyKeymap,
  indentLess,
  indentMore,
  redo,
  standardKeymap,
} from "@codemirror/commands"
import type { Extension } from "@codemirror/state"
import { keymap } from "@codemirror/view"
import {
  cycleMarkdownTemplateStatus,
  getMarkdownTemplateBlockCopyText,
  getMarkdownTemplateBlockEndLine,
  isInsideMarkdownTemplateBlock,
  toggleMarkdownTemplateCommentLines,
} from "@/features/markdown/commands/markdownBlockCommands"
import {
  createMarkdownTable,
  selectAllPreservingScrollPosition,
} from "@/features/markdown/extensions/markdownEditorExtensions"
import type { UseMarkdownEditorActionsResult } from "@/features/markdown/hooks/useMarkdownEditorActions"

import type { TranslationKey } from "@/i18n"

export interface CreateMarkdownFormattingKeymapOptions {
  actions: UseMarkdownEditorActionsResult
  onSaveRef: React.MutableRefObject<(() => void) | undefined>
  showToastSuccessRef: React.MutableRefObject<(msg: string) => void>
  t: (key: TranslationKey, options?: Record<string, string | number>) => string
}

/**
 * 构建 Markdown 格式化、文本样式包裹与快捷编辑操作的键盘映射扩展。
 */
export const createMarkdownFormattingKeymap = ({
  actions,
  onSaveRef,
  showToastSuccessRef,
  t,
}: CreateMarkdownFormattingKeymapOptions): Extension => {
  return keymap.of([
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
        onSaveRef.current?.()
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
    { key: "Mod-Alt-k", mac: "Cmd-Alt-k", run: () => (actions.insertCodeBlock(), true) },
    { key: "Mod-Alt-K", mac: "Cmd-Alt-K", run: () => (actions.insertCodeBlock(), true) },
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
    { key: "Mod-b", run: () => (actions.wrapSelection("**", "**", "bold"), true) },
    { key: "Mod-i", run: () => (actions.wrapSelection("_", "_", "italic"), true) },
    { key: "Mod-1", run: () => (actions.addHeading(1), true) },
    { key: "Mod-2", run: () => (actions.addHeading(2), true) },
    { key: "Mod-3", run: () => (actions.addHeading(3), true) },
    { key: "Mod-4", run: () => (actions.addHeading(4), true) },
    { key: "Mod-5", run: () => (actions.addHeading(5), true) },
    { key: "Mod-6", run: () => (actions.addHeading(6), true) },
    { key: "Mod-o", run: () => (actions.prefixLines("1. ", "Item"), true) },
    { key: "Mod-l", run: () => (actions.wrapSelection("[", "](https://)", "link text"), true) },
    {
      key: "Mod-Shift-s",
      mac: "Cmd-Shift-s",
      run: () => (actions.wrapSelection("~~", "~~", "strikethrough"), true),
    },
    {
      key: "Mod-Shift-S",
      mac: "Cmd-Shift-S",
      run: () => (actions.wrapSelection("~~", "~~", "strikethrough"), true),
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
          showToastSuccessRef.current(t("markdown.copiedCode"))
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
          showToastSuccessRef.current(t("markdown.copiedCode"))
        })
        return true
      },
    },
    {
      key: "Mod-Shift-u",
      mac: "Cmd-Shift-u",
      run: () => (actions.prefixLines("- ", "Item"), true),
    },
    {
      key: "Mod-Shift-U",
      mac: "Cmd-Shift-U",
      run: () => (actions.prefixLines("- ", "Item"), true),
    },
    {
      key: "Mod-Shift-8",
      mac: "Cmd-Shift-8",
      run: () => (actions.prefixLines("1. ", "Item"), true),
    },
    {
      key: "Mod-Shift-9",
      mac: "Cmd-Shift-9",
      run: () => (actions.prefixLines("- ", "Item"), true),
    },
    {
      key: "Mod-Alt-c",
      mac: "Cmd-Alt-c",
      run: () => (actions.wrapSelection("`", "`", "code"), true),
    },
    {
      key: "Mod-Alt-C",
      mac: "Cmd-Alt-C",
      run: () => (actions.wrapSelection("`", "`", "code"), true),
    },
    {
      key: "Mod-Shift-Alt-t",
      mac: "Cmd-Shift-Alt-t",
      run: () => (actions.insertText(createMarkdownTable({ columns: 2, rows: 2 })), true),
    },
    {
      key: "Mod-Shift-Alt-T",
      mac: "Cmd-Shift-Alt-T",
      run: () => (actions.insertText(createMarkdownTable({ columns: 2, rows: 2 })), true),
    },
    { key: "Mod-Shift-f", mac: "Cmd-Shift-f", run: () => (actions.formatDocument(), true) },
    { key: "Mod-Shift-F", mac: "Cmd-Shift-F", run: () => (actions.formatDocument(), true) },
    { key: "Mod-Shift-z", run: redo, preventDefault: true },
    { key: "Mod-Shift-Z", run: redo, preventDefault: true },
    ...historyKeymap,
    ...standardKeymap,
  ])
}
