import {
  deleteLine,
  history,
  historyKeymap,
  indentLess,
  indentMore,
  redo,
  standardKeymap,
  undo,
} from "@codemirror/commands"
import { markdown } from "@codemirror/lang-markdown"
import {
  bracketMatching,
  foldKeymap,
  foldState,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { EditorState, Transaction } from "@codemirror/state"
import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import { Redo2, Undo2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { MarkdownEditorToolbar } from "@/components/ui/LxMarkdown/components/MarkdownEditorToolbar"
import {
  captureEditorScrollAnchor,
  createMarkdownTable,
  formatMarkdown,
  mapMarkdownPosition,
  markdownHighlightStyle,
  restoreEditorScrollAnchor,
  selectAllPreservingScrollPosition,
} from "@/components/ui/LxMarkdown/extensions/markdownEditorExtensions"
import {
  markdownFoldGutter,
  markdownHeadingFolding,
} from "@/components/ui/LxMarkdown/extensions/markdownFolding"
import type { LxMarkdownEditorProps, MarkdownToolbarAction } from "@/components/ui/LxMarkdown/types"
import { useLxToast } from "@/components/ui/LxToast"
import { editorTheme } from "@/features/markdown/extensions/editorTheme"
import { markdownMarkerHighlight } from "@/features/markdown/extensions/markerPlugin"
import { useTranslation } from "@/i18n"

/**
 * 渲染 Markdown 编辑器（编辑模式，无预览分栏）。
 */
export const LxMarkdownEditor = ({
  initialContent = "",
  onChange,
  onSave,
  isSaved = true,
  showSaveStatus = false,
  showToolbar = true,
  toolbarActions,
  extraExtensions,
  height,
  autoHeight = false,
  showLineNumbers = false,
  showFolding = false,
  initialLogFolded = true,
  allowStandaloneSubblocks = false,
}: LxMarkdownEditorProps): React.JSX.Element => {
  // 模板块操作提示与文案：经 ref 读取，避免引用变化触发编辑器重建。
  const { t } = useTranslation()
  const toast = useLxToast()
  const markerTRef = useRef(t)
  markerTRef.current = t
  const markerToastRef = useRef(toast)
  markerToastRef.current = toast
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  // 编辑器自身回传给外部的最后内容，用于区分外部变更与输入回响。
  const lastEmittedContentRef = useRef(initialContent)
  // 创建视图时使用的最新外部内容（挂载后外部内容可能已更新）。
  const initialContentRef = useRef(initialContent)
  // 光标之前的文档文本：select 型工具项据此判断选项可用性（如仅限任务块内部）。
  const [textBeforeCursor, setTextBeforeCursor] = useState("")
  // 是否存在 select 型工具项：仅此时维护光标上下文，避免无关编辑器产生额外开销。
  const hasSelectActionRef = useRef(false)
  hasSelectActionRef.current = (toolbarActions ?? []).some((action) => action.select !== undefined)
  // 额外扩展：仅在创建编辑器时读取，避免调用方每次渲染传入新引用导致编辑器重建。
  const extraExtensionsRef = useRef(extraExtensions)
  extraExtensionsRef.current = extraExtensions

  useEffect(() => {
    initialContentRef.current = initialContent
  }, [initialContent])

  // 外部内容变更（保存后重载、重置、刷新）时同步正文；自身输入不触发替换，避免光标跳变。
  useEffect(() => {
    const view = editorViewRef.current
    if (!view) return

    const currentContent = view.state.doc.toString()
    if (initialContent === currentContent) {
      lastEmittedContentRef.current = initialContent
      return
    }
    if (initialContent === lastEmittedContentRef.current) return

    const anchor = captureEditorScrollAnchor(view)
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: initialContent },
      // 标记为外部来源并排除出撤销历史：供只读保护过滤器放行，且撤销不会回退起止行更新。
      annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)],
    })
    restoreEditorScrollAnchor(view, anchor)
    lastEmittedContentRef.current = initialContent
  }, [initialContent])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  /**
   * 在当前选区插入内容，并将焦点还给编辑器。
   */
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

  /**
   * 为选区包裹 Markdown 标记；无选区时插入可直接替换的占位内容。
   */
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

  /**
   * 插入或包裹代码块。
   */
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

  /**
   * 格式化整篇 Markdown，并将结果作为一次可撤销的编辑提交。
   */
  const formatDocument = (): void => {
    const view = editorViewRef.current
    if (!view) return

    const sourceContent = view.state.doc.toString()
    const anchor = captureEditorScrollAnchor(view)
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
    restoreEditorScrollAnchor(view, anchor)
    view.focus()
  }

  /**
   * 在选择的每一行前添加 Markdown 列表或引用前缀。
   */
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

  /**
   * 在当前选区的每一行前添加指定层级的 Markdown 标题标记。
   */
  const addHeading = (level: number): void => {
    prefixLines(`${"#".repeat(level)} `, "Heading")
  }

  useEffect(() => {
    const container = editorContainerRef.current
    if (!container) return

    const state = EditorState.create({
      doc: initialContentRef.current,
      extensions: [
        history(),
        markdown({
          codeLanguages: languages,
          extensions: [GFM, { remove: ["SetextHeading"] }],
        }),
        syntaxHighlighting(markdownHighlightStyle),
        editorTheme,
        ...(autoHeight
          ? [
              EditorView.theme({
                // 高度随内容伸缩；基主题的 35vh 底部留白是给可滚动编辑器用的，自适应时去掉。
                "&": { height: "auto" },
                ".cm-scroller": { height: "auto", overflow: "hidden" },
                ".cm-content": { paddingBottom: "24px" },
              }),
            ]
          : []),
        markdownMarkerHighlight(
          showFolding,
          undefined,
          {
            success: (msg) => markerToastRef.current.success(msg),
            warning: (msg) => markerToastRef.current.warning(msg),
          },
          (key) => markerTRef.current(key as Parameters<typeof t>[0]),
          initialLogFolded,
          allowStandaloneSubblocks,
        ),
        ...(showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
        ...(showFolding
          ? [foldState, markdownHeadingFolding, markdownFoldGutter, keymap.of(foldKeymap)]
          : []),
        EditorView.lineWrapping,
        indentUnit.of("  "),
        indentOnInput(),
        bracketMatching(),
        keymap.of([
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
          ...(showSaveStatus
            ? [
                {
                  key: "Mod-s",
                  run: () => {
                    onSaveRef.current?.()
                    return true
                  },
                },
              ]
            : []),
          { key: "Tab", run: indentMore },
          { key: "Shift-Tab", run: indentLess },
          { key: "Mod-d", run: deleteLine },
          { key: "Mod-b", run: () => (wrapSelection("**", "**", "bold"), true) },
          { key: "Mod-i", run: () => (wrapSelection("_", "_", "italic"), true) },
          { key: "Mod-1", run: () => (addHeading(1), true) },
          { key: "Mod-2", run: () => (addHeading(2), true) },
          { key: "Mod-3", run: () => (addHeading(3), true) },
          { key: "Mod-4", run: () => (addHeading(4), true) },
          { key: "Mod-5", run: () => (addHeading(5), true) },
          { key: "Mod-6", run: () => (addHeading(6), true) },
          { key: "Mod-o", run: () => (prefixLines("1. ", "Item"), true) },
          { key: "Mod-l", run: () => (wrapSelection("[", "](https://)", "link text"), true) },
          { key: "Mod-Shift-s", run: () => (wrapSelection("~~", "~~", "strikethrough"), true) },
          { key: "Mod-Shift-u", run: () => (prefixLines("- ", "Item"), true) },
          { key: "Mod-Shift-c", run: () => (insertCodeBlock(), true) },
          { key: "Mod-Shift-8", run: () => (prefixLines("1. ", "Item"), true) },
          { key: "Mod-Shift-9", run: () => (prefixLines("- ", "Item"), true) },
          { key: "Mod-Alt-c", run: () => (wrapSelection("`", "`", "code"), true) },
          {
            key: "Mod-Shift-Alt-t",
            run: () => (insertText(createMarkdownTable({ columns: 2, rows: 2 })), true),
          },
          { key: "Mod-Shift-f", run: () => (formatDocument(), true) },
          ...historyKeymap,
          ...standardKeymap,
        ]),
        ...(extraExtensionsRef.current ? [extraExtensionsRef.current] : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const nextContent = update.state.doc.toString()
            lastEmittedContentRef.current = nextContent
            onChangeRef.current?.(nextContent)
          }

          if (!hasSelectActionRef.current) return
          if (!update.docChanged && !update.selectionSet) return

          const cursor = update.state.selection.main.head
          const nextTextBeforeCursor = update.state.doc.sliceString(0, cursor)
          setTextBeforeCursor((prev) =>
            prev === nextTextBeforeCursor ? prev : nextTextBeforeCursor,
          )
        }),
      ],
    })
    const view = new EditorView({ state, parent: container })
    editorViewRef.current = view

    return () => {
      editorViewRef.current = null
      view.destroy()
    }
  }, [showLineNumbers, showFolding, initialLogFolded, allowStandaloneSubblocks])

  const actions: MarkdownToolbarAction[] = [
    {
      icon: Undo2,
      label: t("common.undo"),
      onClick: () => editorViewRef.current && undo(editorViewRef.current),
    },
    {
      icon: Redo2,
      label: t("common.redo"),
      onClick: () => editorViewRef.current && redo(editorViewRef.current),
    },
    ...(toolbarActions ?? []),
  ]

  return (
    <section
      className={`flex min-w-0 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] ${
        autoHeight ? "" : height === undefined ? "flex-1" : ""
      }`}
      style={autoHeight || height === undefined ? undefined : { height }}
    >
      {showToolbar && (
        <MarkdownEditorToolbar
          actions={actions}
          isSaved={isSaved}
          showSaveStatus={showSaveStatus}
          onInsertTable={(size) => insertText(createMarkdownTable(size))}
          onInsertText={insertText}
          textBeforeCursor={textBeforeCursor}
        />
      )}
      <div className={`min-h-0 flex text-sm ${autoHeight ? "" : "flex-1"}`}>
        <div
          ref={editorContainerRef}
          className={`min-w-0 ${autoHeight ? "" : "custom-scrollbar min-h-0 flex-1"}`}
        />
      </div>
    </section>
  )
}
