import {
  deleteLine,
  history,
  historyKeymap,
  indentLess,
  indentMore,
  redo,
  undo,
} from "@codemirror/commands"
import { markdown } from "@codemirror/lang-markdown"
import { syntaxHighlighting } from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { EditorState } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import {
  Bold,
  Code,
  Code2,
  Eye,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Redo2,
  SquareSplitHorizontal,
  Strikethrough,
  Undo2,
} from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { MarkdownEditorToolbar } from "@/components/ui/LxMarkdownEditor/components/MarkdownEditorToolbar"
import { MarkdownPreview } from "@/components/ui/LxMarkdownEditor/components/MarkdownPreview"
import {
  createMarkdownTable,
  editorTheme,
  markdownHighlightStyle,
  markdownMarkerHighlight,
  selectAllPreservingScrollPosition,
  synchronizeScrollByScale,
} from "@/components/ui/LxMarkdownEditor/markdownEditorExtensions"
import { markdownRenderer } from "@/components/ui/LxMarkdownEditor/markdownRenderer"
import type {
  EditorScrollAnchor,
  LxMarkdownEditorProps,
  MarkdownPreviewMode,
  MarkdownToolbarAction,
} from "@/components/ui/LxMarkdownEditor/types"

/**
 * 渲染可编辑、预览和分栏浏览模式的 Markdown 编辑器。
 */
export const LxMarkdownEditor = ({
  initialContent = "",
  onChange,
}: LxMarkdownEditorProps): React.JSX.Element => {
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const previewRef = useRef<HTMLElement>(null)
  const editorScrollAnchorRef = useRef<EditorScrollAnchor | null>(null)
  const onChangeRef = useRef(onChange)
  const [content, setContent] = useState(initialContent)
  const [previewMode, setPreviewMode] = useState<MarkdownPreviewMode>("edit")
  const previewHtml = useMemo(() => markdownRenderer.render(content), [content])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

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
    const view = editorViewRef.current
    if (view) {
      const { scrollLeft, scrollTop } = view.scrollDOM
      const block = view.lineBlockAtHeight(scrollTop)
      editorScrollAnchorRef.current = {
        left: scrollLeft,
        line: view.state.doc.lineAt(block.from).number,
        offset: scrollTop - block.top,
      }
    }

    setPreviewMode(mode)
  }

  useEffect(() => {
    const container = editorContainerRef.current
    if (!container) return

    const state = EditorState.create({
      doc: content,
      extensions: [
        history(),
        markdown({ codeLanguages: languages, extensions: [GFM] }),
        syntaxHighlighting(markdownHighlightStyle),
        editorTheme,
        markdownMarkerHighlight,
        EditorView.lineWrapping,
        keymap.of([
          { key: "Mod-a", run: selectAllPreservingScrollPosition },
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
          { key: "Mod-Shift-c", run: () => (wrapSelection("```\n", "\n```", "code"), true) },
          { key: "Mod-Shift-8", run: () => (prefixLines("1. ", "Item"), true) },
          { key: "Mod-Shift-9", run: () => (prefixLines("- ", "Item"), true) },
          { key: "Mod-Alt-c", run: () => (wrapSelection("`", "`", "code"), true) },
          {
            key: "Mod-Shift-Alt-t",
            run: () => (insertText(createMarkdownTable({ columns: 2, rows: 2 })), true),
          },
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const nextContent = update.state.doc.toString()
            setContent(nextContent)
            onChangeRef.current?.(nextContent)
          }
        }),
      ],
    })
    const view = new EditorView({ state, parent: container })
    editorViewRef.current = view

    return () => {
      editorViewRef.current = null
      view.destroy()
    }
  }, [])

  useLayoutEffect(() => {
    const anchor = editorScrollAnchorRef.current
    const view = editorViewRef.current
    if (!anchor || !view) return

    view.requestMeasure({
      read: () => anchor,
      write: (scrollAnchor, measuredView) => {
        const line = measuredView.state.doc.line(
          Math.min(scrollAnchor.line, measuredView.state.doc.lines),
        )
        const block = measuredView.lineBlockAt(line.from)
        measuredView.scrollDOM.scrollTo({
          left: scrollAnchor.left,
          top: block.top + scrollAnchor.offset,
        })
        if (editorScrollAnchorRef.current === scrollAnchor) {
          editorScrollAnchorRef.current = null
        }
      },
    })
  }, [previewMode])

  useEffect(() => {
    if (previewMode !== "split") return

    const editorScrollElement = editorViewRef.current?.scrollDOM
    const previewElement = previewRef.current
    if (!editorScrollElement || !previewElement) return

    let restoreListenerTimer: number | null = null

    const synchronize = (
      source: HTMLElement,
      target: HTMLElement,
      targetListener: EventListener,
    ): void => {
      target.removeEventListener("scroll", targetListener)
      synchronizeScrollByScale(source, target)
      if (restoreListenerTimer !== null) window.clearTimeout(restoreListenerTimer)
      restoreListenerTimer = window.setTimeout(() => {
        target.addEventListener("scroll", targetListener)
        restoreListenerTimer = null
      }, 50)
    }

    const synchronizePreview = (): void =>
      synchronize(editorScrollElement, previewElement, synchronizeEditor)
    const synchronizeEditor = (): void =>
      synchronize(previewElement, editorScrollElement, synchronizePreview)

    editorScrollElement.addEventListener("scroll", synchronizePreview)
    previewElement.addEventListener("scroll", synchronizeEditor)
    synchronizePreview()

    return () => {
      editorScrollElement.removeEventListener("scroll", synchronizePreview)
      previewElement.removeEventListener("scroll", synchronizeEditor)
      if (restoreListenerTimer !== null) window.clearTimeout(restoreListenerTimer)
    }
  }, [previewHtml, previewMode])

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
    { icon: Bold, label: "粗体", onClick: () => wrapSelection("**", "**", "bold") },
    { icon: Italic, label: "斜体", onClick: () => wrapSelection("_", "_", "italic") },
    {
      icon: Strikethrough,
      label: "删除线",
      onClick: () => wrapSelection("~~", "~~", "strikethrough"),
    },
    { icon: List, label: "无序列表", onClick: () => prefixLines("- ", "Item") },
    { icon: ListOrdered, label: "有序列表", onClick: () => prefixLines("1. ", "Item") },
    { icon: ListTodo, label: "任务列表", onClick: () => prefixLines("- [ ] ", "Task") },
    { icon: Quote, label: "引用", onClick: () => prefixLines("> ", "Quote") },
    { icon: Code2, label: "行内代码", onClick: () => wrapSelection("`", "`", "code") },
    { icon: Code, label: "代码块", onClick: () => wrapSelection("```\n", "\n```", "code") },
    { icon: Link, label: "链接", onClick: () => wrapSelection("[", "](https://)", "link text") },
    {
      icon: SquareSplitHorizontal,
      label: "双栏预览",
      onClick: () => changePreviewMode(previewMode === "split" ? "edit" : "split"),
      alignRight: true,
      highlighted: previewMode === "split",
    },
    {
      icon: Eye,
      label: "仅预览",
      onClick: () => changePreviewMode(previewMode === "preview" ? "edit" : "preview"),
      highlighted: previewMode === "preview",
    },
  ]

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      <MarkdownEditorToolbar
        actions={actions}
        onInsertTable={(size) => insertText(createMarkdownTable(size))}
      />
      <div className="min-h-0 flex flex-1">
        <div
          ref={editorContainerRef}
          className={`min-h-0 min-w-0 flex-1 ${previewMode === "preview" ? "hidden" : ""}`}
        />
        {previewMode !== "edit" && (
          <MarkdownPreview html={previewHtml} previewMode={previewMode} previewRef={previewRef} />
        )}
      </div>
    </section>
  )
}
