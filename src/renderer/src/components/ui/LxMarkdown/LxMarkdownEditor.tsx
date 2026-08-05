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
import { EditorState, Prec } from "@codemirror/state"
import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import {
  Code,
  Eye,
  List,
  ListOrdered,
  ListTodo,
  Redo2,
  SquareSplitHorizontal,
  Undo2,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  isInsideMarkdownTemplateBlock,
  toggleMarkdownTemplateDone,
} from "@/components/ui/LxMarkdown/commands/markdownBlockCommands"
import { createMarkdownReference } from "@/components/ui/LxMarkdown/commands/markdownReferenceCommands"
import { FileMentionCommandMenu } from "@/components/ui/LxMarkdown/components/FileMentionCommandMenu"
import { MarkdownBlockCommandMenu } from "@/components/ui/LxMarkdown/components/MarkdownBlockCommandMenu"
import { MarkdownEditorToolbar } from "@/components/ui/LxMarkdown/components/MarkdownEditorToolbar"
import { MarkdownSlashCommandMenu } from "@/components/ui/LxMarkdown/components/MarkdownSlashCommandMenu"
import {
  createMarkdownTable,
  editorTheme,
  formatMarkdown,
  mapMarkdownPosition,
  markdownHighlightStyle,
  markdownMarkerHighlight,
  markdownReferenceHover,
  selectAllPreservingScrollPosition,
} from "@/components/ui/LxMarkdown/extensions/markdownEditorExtensions"
import { getFileMentionDeletionRange } from "@/components/ui/LxMarkdown/extensions/markdownFileMentions"
import {
  markdownFoldGutter,
  markdownHeadingFolding,
} from "@/components/ui/LxMarkdown/extensions/markdownFolding"
import { useEditorScrollSync } from "@/components/ui/LxMarkdown/hooks/useEditorScrollSync"
import { useMarkdownPanels } from "@/components/ui/LxMarkdown/hooks/useMarkdownPanels"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import type {
  LxMarkdownEditorProps,
  MarkdownPreviewMode,
  MarkdownToolbarAction,
} from "@/components/ui/LxMarkdown/types"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { useLxToast } from "@/components/ui/LxToast"
import { isMacOS } from "@/lib/platform"

/**
 * 从剪贴板读取本地文件绝对路径。
 */
const getClipboardFile = (
  event: ClipboardEvent,
): { isDirectory: boolean; isImage: boolean; path: string } | null => {
  const clipboardData = event.clipboardData
  if (!clipboardData) return null

  const plainText = clipboardData.getData("text/plain")
  if (plainText.startsWith("/")) {
    const path = plainText.trim()
    return { isDirectory: false, isImage: /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(path), path }
  }

  const fileUri = clipboardData
    .getData("text/uri-list")
    .split(/\r?\n/)
    .find((value) => value.trim() && !value.trim().startsWith("#"))

  if (fileUri?.startsWith("file://")) {
    try {
      const path = decodeURIComponent(new URL(fileUri.trim()).pathname)
      return { isDirectory: false, isImage: /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(path), path }
    } catch {
      return null
    }
  }

  const file = clipboardData.files[0]
  if (!file) return null

  try {
    const path = window.api.getPathForFile(file)
    if (!path) return null

    const item = Array.from(clipboardData.items).find(
      (clipboardItem) => clipboardItem.kind === "file",
    )
    const entry = (
      item as
        | (DataTransferItem & { webkitGetAsEntry?: () => { isDirectory: boolean } | null })
        | undefined
    )?.webkitGetAsEntry?.()

    return {
      isDirectory: entry?.isDirectory ?? false,
      isImage: file.type.startsWith("image/") || /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(path),
      path,
    }
  } catch {
    return null
  }
}

/**
 * 渲染可编辑、预览和分栏浏览模式的 Markdown 编辑器。
 */
export const LxMarkdownEditor = ({
  initialContent = "",
  pages,
  onChange,
  onPagesChange,
  onSave,
  isSaved = true,
  pageMode = false,
  projectId,
  onSearchFiles,
  onSearchReferencedFiles,
  referencedProjectPaths,
  showLineNumbers = false,
  showFolding = false,
}: LxMarkdownEditorProps): React.JSX.Element => {
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const previewRef = useRef<HTMLElement>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const pagesRef = useRef(pages)
  const activePageIndexRef = useRef(0)
  const onPagesChangeRef = useRef(onPagesChange)

  const [content, setContent] = useState(() =>
    pageMode && pages?.length
      ? (pages[pages.length - 1]?.content ?? initialContent)
      : initialContent,
  )
  const [activePageIndex, setActivePageIndex] = useState(() =>
    pageMode && pages?.length ? pages.length - 1 : 0,
  )
  const [pageName, setPageName] = useState("")
  const [previewMode, setPreviewMode] = useState<MarkdownPreviewMode>("edit")
  const { warning } = useLxToast()
  pagesRef.current = pages
  activePageIndexRef.current = activePageIndex
  onPagesChangeRef.current = onPagesChange
  const pageModeRef = useRef(pageMode)
  pageModeRef.current = pageMode
  const activePage = pageMode ? pages?.[activePageIndex] : undefined
  const referencedRootsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    referencedRootsRef.current = new Set(referencedProjectPaths ?? [])
  }, [referencedProjectPaths])
  const previewHtml = useMemo(
    () =>
      markdownRenderer.render(content, {
        referencedRoots: new Set(referencedProjectPaths ?? []),
      }),
    [content, referencedProjectPaths],
  )

  useEffect(() => {
    if (!pageMode || !pages?.length) return
    const nextPage = pages[Math.min(activePageIndex, pages.length - 1)]
    if (!nextPage) return
    setContent(nextPage.content)
    setPageName(nextPage.name)
  }, [activePageIndex, pageMode, pages])

  useEffect(() => {
    if (!pageMode || !activePage || !editorViewRef.current) return
    const view = editorViewRef.current
    const nextContent = activePage.content
    if (view.state.doc.toString() === nextContent) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: nextContent },
    })
  }, [activePage, pageMode])

  const switchPage = (index: number): void => {
    if (!pages || index < 0 || index >= pages.length || index === activePageIndex) return
    setActivePageIndex(index)
  }

  /**
   * 创建一个空白页面并切换到该页面。
   */
  const createPage = (): void => {
    const nextPage = {
      id: crypto.randomUUID(),
      name: `Page ${(pages?.length ?? 0) + 1}`,
      content: "",
    }
    const nextPages = [...(pages ?? []), nextPage]
    onPagesChangeRef.current?.(nextPages)
    setActivePageIndex(nextPages.length - 1)
  }

  /**
   * 保存当前页面名称。
   */
  const renamePage = (name: string): void => {
    setPageName(name)
    if (!pages || !activePage) return
    onPagesChangeRef.current?.(
      pages.map((page, index) => (index === activePageIndex ? { ...page, name } : page)),
    )
  }

  /**
   * 删除当前页面并切换到相邻页面。
   */
  const deletePage = (): void => {
    if (!pages || pages.length <= 1) return
    const nextPages = pages.filter((_, index) => index !== activePageIndex)
    onPagesChangeRef.current?.(nextPages)
    setActivePageIndex(Math.min(activePageIndex, nextPages.length - 1))
  }

  const switchPageRef = useRef(switchPage)
  const createPageRef = useRef(createPage)
  switchPageRef.current = switchPage
  createPageRef.current = createPage

  const {
    blockCommandPanel,
    activeBlockCommandIndex,
    slashCommandPanel,
    activeSlashCommandIndex,
    fileMentionPanel,
    activeFileMentionIndex,
    blockCommandPanelRef,
    activeBlockCommandIndexRef,
    slashCommandPanelRef,
    activeSlashCommandIndexRef,
    fileMentionPanelRef,
    activeFileMentionIndexRef,
    closeFileMentionPanel,
    closeSlashCommandPanel,
    syncSlashCommandPanel,
    selectSlashCommand,
    handleSlashCommandKey,
    syncFileMentionPanel,
    selectFileMention,
    handleFileMentionKey,
    syncBlockCommandPanel,
    selectBlockCommand,
    handleBlockCommandKey,
    setBlockCommandPanel,
  } = useMarkdownPanels({
    editorViewRef,
    projectId,
    onSearchFiles,
    onSearchReferencedFiles,
    referencedProjectPaths,
  })

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

      if (isModKey && isShift) {
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
          warning("当前页内容为空，请先输入内容再创建下一页")
          return
        }
        createPageRef.current()
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

  /**
   * 切换模板块结束行的 done 标记，作为完成状态持久化在源码中。
   */
  const toggleTemplateStatus = (line: number, done: boolean): void => {
    const view = editorViewRef.current
    if (!view) return

    const docLine = view.state.doc.line(line + 1)
    const nextLineText = toggleMarkdownTemplateDone(docLine.text, done)
    if (nextLineText === null) return

    view.dispatch({ changes: { from: docLine.from, to: docLine.to, insert: nextLineText } })
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
        markdownReferenceHover,
        markdownMarkerHighlight(showFolding, () => referencedRootsRef.current),
        ...(showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
        ...(showFolding
          ? [foldState, markdownHeadingFolding, markdownFoldGutter, keymap.of(foldKeymap)]
          : []),
        EditorView.lineWrapping,
        indentUnit.of("  "),
        indentOnInput(),
        bracketMatching(),
        Prec.highest(
          keymap.of([
            {
              key: "ArrowDown",
              run: () =>
                handleFileMentionKey("ArrowDown") ||
                handleSlashCommandKey(1) ||
                handleBlockCommandKey(1),
            },
            {
              key: "ArrowUp",
              run: () =>
                handleFileMentionKey("ArrowUp") ||
                handleSlashCommandKey(-1) ||
                handleBlockCommandKey(-1),
            },
            {
              key: "Enter",
              run: (view) => {
                const fileMention = fileMentionPanelRef.current
                if (fileMention) {
                  selectFileMention(
                    fileMention.files[activeFileMentionIndexRef.current] ?? fileMention.files[0],
                  )
                  return true
                }

                const slashCommand = slashCommandPanelRef.current
                if (slashCommand) {
                  selectSlashCommand(
                    slashCommand.commands[activeSlashCommandIndexRef.current] ??
                      slashCommand.commands[0],
                  )
                  return true
                }

                const panel = blockCommandPanelRef.current
                if (panel) {
                  selectBlockCommand(
                    panel.commands[activeBlockCommandIndexRef.current] ?? panel.commands[0],
                  )
                  return true
                }

                const cursor = view.state.selection.main.head
                const line = view.state.doc.lineAt(cursor)
                const templateEndMatch = /^(\s*)&&&(?:\s+done)?\s*$/.exec(line.text)
                if (
                  cursor === line.to &&
                  templateEndMatch &&
                  isInsideMarkdownTemplateBlock(view.state.doc.sliceString(0, line.from))
                ) {
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
              key: "Escape",
              run: () => {
                if (fileMentionPanelRef.current) {
                  closeFileMentionPanel()
                  return true
                }
                if (slashCommandPanelRef.current) {
                  closeSlashCommandPanel()
                  return true
                }
                if (blockCommandPanelRef.current) {
                  blockCommandPanelRef.current = null
                  setBlockCommandPanel(null)
                  return true
                }
                return false
              },
            },
          ]),
        ),
        Prec.high(
          EditorView.domEventHandlers({
            paste: (event, view) => {
              const file = getClipboardFile(event)
              if (!file) return false

              event.preventDefault()
              const type = file.isDirectory ? "folder" : file.isImage ? "image" : "file"
              const { from, to } = view.state.selection.main
              const prevChar = from > 0 ? view.state.doc.sliceString(from - 1, from) : ""
              const leadingSpace = prevChar && !/\s/.test(prevChar) ? " " : ""
              const insertion = `${leadingSpace}${createMarkdownReference(type, file.path)} `
              view.dispatch({
                changes: { from, to, insert: insertion },
                selection: { anchor: from + insertion.length },
                userEvent: "input.paste",
              })
              return true
            },
            keydown: (event, view) => {
              if (event.key !== "Backspace" || fileMentionPanelRef.current) return false

              const { selection } = view.state
              if (!selection.main.empty) return false

              const cursor = selection.main.head
              const deletionRange = getFileMentionDeletionRange(view.state.doc.toString(), cursor)
              if (!deletionRange) return false

              event.preventDefault()
              view.dispatch({
                changes: { from: deletionRange.start, to: deletionRange.end, insert: "" },
                selection: { anchor: deletionRange.start },
                userEvent: "delete.backward",
              })
              closeFileMentionPanel()
              return true
            },
          }),
        ),
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
          if (update.docChanged || update.selectionSet || update.viewportChanged) {
            syncBlockCommandPanel(update.view)
            syncSlashCommandPanel(update.view)
          }
          if (update.docChanged) syncFileMentionPanel(update.view)
          if (update.selectionSet && !update.docChanged) {
            closeFileMentionPanel()
          }
          if (update.docChanged) {
            const nextContent = update.state.doc.toString()
            setContent(nextContent)
            if (pageMode && pagesRef.current && pagesRef.current[activePageIndexRef.current]) {
              onPagesChangeRef.current?.(
                pagesRef.current.map((page, index) =>
                  index === activePageIndexRef.current ? { ...page, content: nextContent } : page,
                ),
              )
            }
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
    { icon: List, label: "无序列表", onClick: () => prefixLines("- ", "Item") },
    { icon: ListOrdered, label: "有序列表", onClick: () => prefixLines("1. ", "Item") },
    { icon: ListTodo, label: "任务列表", onClick: () => prefixLines("- [ ] ", "Task") },
    { icon: Code, label: "代码块", onClick: insertCodeBlock },
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
        pageMode={pageMode}
        pages={pages}
        activePageIndex={activePageIndex}
        pageName={pageName}
        onPageChange={switchPage}
        onPageNameChange={renamePage}
        onCreatePage={createPage}
        onDeletePage={deletePage}
      />
      <div className="min-h-0 flex flex-1 text-sm">
        <div
          ref={editorContainerRef}
          className={`custom-scrollbar min-h-0 min-w-0 flex-1 ${previewMode === "preview" ? "hidden" : ""}`}
        />
        {previewMode !== "edit" && (
          <LxMarkdownPreview
            html={previewHtml}
            previewMode={previewMode}
            previewRef={previewRef}
            onTemplateStatusToggle={toggleTemplateStatus}
          />
        )}
      </div>
      <MarkdownBlockCommandMenu
        activeIndex={activeBlockCommandIndex}
        commands={blockCommandPanel?.commands}
        position={blockCommandPanel?.position}
        visible={Boolean(blockCommandPanel)}
      />
      <MarkdownSlashCommandMenu
        activeIndex={activeSlashCommandIndex}
        commands={slashCommandPanel?.commands}
        position={slashCommandPanel?.position}
        visible={Boolean(slashCommandPanel)}
      />
      <FileMentionCommandMenu
        activeIndex={activeFileMentionIndex}
        files={fileMentionPanel?.files}
        position={fileMentionPanel?.position}
        visible={Boolean(fileMentionPanel)}
      />
    </section>
  )
}
