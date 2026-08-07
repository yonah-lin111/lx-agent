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
import { EditorState } from "@codemirror/state"
import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import { Eye, Redo2, SquareSplitHorizontal, Undo2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { MarkdownEditorToolbar } from "@/components/ui/LxMarkdown/components/MarkdownEditorToolbar"
import {
  createMarkdownTable,
  editorTheme,
  formatMarkdown,
  mapMarkdownPosition,
  markdownHighlightStyle,
  selectAllPreservingScrollPosition,
} from "@/components/ui/LxMarkdown/extensions/markdownEditorExtensions"
import {
  markdownFoldGutter,
  markdownHeadingFolding,
} from "@/components/ui/LxMarkdown/extensions/markdownFolding"
import { markdownMarkerHighlight } from "@/components/ui/LxMarkdown/extensions/markdownMarkerHighlight"
import { useEditorScrollSync } from "@/components/ui/LxMarkdown/hooks/useEditorScrollSync"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import type {
  LxMarkdownEditorProps,
  MarkdownPreviewMode,
  MarkdownToolbarAction,
} from "@/components/ui/LxMarkdown/types"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { isMacOS } from "@/lib/platform"

/**
 * 渲染可编辑、预览和分栏浏览模式的 Markdown 编辑器。
 */
export const LxMarkdownEditor = ({
  initialContent = "",
  onChange,
  onSave,
  isSaved = true,
  showLineNumbers = false,
  showFolding = false,
}: LxMarkdownEditorProps): React.JSX.Element => {
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const previewRef = useRef<HTMLElement>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)

  const [content, setContent] = useState(initialContent)
  const [previewMode, setPreviewMode] = useState<MarkdownPreviewMode>("edit")

  const previewHtml = useMemo(() => markdownRenderer.render(content), [content])

  const { captureScrollAnchor } = useEditorScrollSync({
    editorViewRef,
    previewRef,
    previewMode,
    previewHtml,
  })

  const previewModeRef = useRef(previewMode)
  useEffect(() => {
    previewModeRef.current = previewMode
  }, [previewMode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const isModKey = event.metaKey || event.ctrlKey
      const isShift = event.shiftKey
      if (!isModKey || !isShift) return

      const key = event.key.toLowerCase()
      if (key === "e") {
        event.preventDefault()
        const currentMode = previewModeRef.current
        changePreviewMode(currentMode === "split" ? "edit" : "split")
      } else if (key === "v") {
        event.preventDefault()
        const currentMode = previewModeRef.current
        changePreviewMode(currentMode === "preview" ? "edit" : "preview")
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

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

  /**
   * 在编辑区宽度变更前记录首个可见行，供测量完成后恢复视觉位置。
   */
  const changePreviewMode = (mode: MarkdownPreviewMode): void => {
    captureScrollAnchor()
    setPreviewMode(mode)
  }

  useEffect(() => {
    const container = editorContainerRef.current
    if (!container) return

    const state = EditorState.create({
      doc: content,
      extensions: [
        history(),
        markdown({
          codeLanguages: languages,
          extensions: [GFM, { remove: ["SetextHeading"] }],
        }),
        syntaxHighlighting(markdownHighlightStyle),
        editorTheme,
        markdownMarkerHighlight(showFolding),
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
          {
            key: "Mod-s",
            run: () => {
              onSaveRef.current?.()
              return true
            },
          },
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
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return

          const nextContent = update.state.doc.toString()
          setContent(nextContent)
          onChangeRef.current?.(nextContent)
        }),
      ],
    })
    const view = new EditorView({ state, parent: container })
    editorViewRef.current = view

    return () => {
      editorViewRef.current = null
      view.destroy()
    }
  }, [showLineNumbers, showFolding])

  const splitLabel = isMacOS() ? "双栏预览 (Cmd+Shift+E)" : "双栏预览 (Ctrl+Shift+E)"
  const previewLabel = isMacOS() ? "仅预览 (Cmd+Shift+V)" : "仅预览 (Ctrl+Shift+V)"

  const actions: MarkdownToolbarAction[] = [
    {
      icon: Undo2,
      label: "撤销",
      onClick: () => editorViewRef.current && undo(editorViewRef.current),
    },
    {
      icon: Redo2,
      label: "重做",
      onClick: () => editorViewRef.current && redo(editorViewRef.current),
    },
    {
      icon: SquareSplitHorizontal,
      label: splitLabel,
      onClick: () => changePreviewMode(previewMode === "split" ? "edit" : "split"),
      alignRight: true,
      highlighted: previewMode === "split",
    },
    {
      icon: Eye,
      label: previewLabel,
      onClick: () => changePreviewMode(previewMode === "preview" ? "edit" : "preview"),
      highlighted: previewMode === "preview",
    },
  ]

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      <MarkdownEditorToolbar
        actions={actions}
        isSaved={isSaved}
        onInsertTable={(size) => insertText(createMarkdownTable(size))}
      />
      <div className="min-h-0 flex flex-1 text-sm">
        <div
          ref={editorContainerRef}
          className={`custom-scrollbar min-h-0 min-w-0 flex-1 ${previewMode === "preview" ? "hidden" : ""}`}
        />
        {previewMode !== "edit" && (
          <LxMarkdownPreview html={previewHtml} previewMode={previewMode} previewRef={previewRef} />
        )}
      </div>
    </section>
  )
}
