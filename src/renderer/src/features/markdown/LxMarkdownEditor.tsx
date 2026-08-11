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
import { EditorState, type Line, Prec, Transaction } from "@codemirror/state"
import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import { Eye, Redo2, SquareSplitHorizontal, Undo2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import {
  cycleMarkdownTemplateStatus,
  getMarkdownTemplateBlockContent,
  getMarkdownTemplateBlockRanges,
  getMarkdownTemplateBlockStartLine,
  getMarkdownTemplateIdRanges,
  isInsideMarkdownTemplateBlock,
  type MarkdownTemplateBlockRange,
  type MarkdownTemplateStatusFilter,
  setMarkdownTemplateTitle,
  toggleMarkdownTemplateCommentLines,
} from "@/features/markdown/commands/markdownBlockCommands"
import { createMarkdownReference } from "@/features/markdown/commands/markdownReferenceCommands"
import { isMarkdownConfirmCommandArmed } from "@/features/markdown/commands/markdownSlashCommands"
import { FileMentionCommandMenu } from "@/features/markdown/components/FileMentionCommandMenu"
import { MarkdownBlockCommandMenu } from "@/features/markdown/components/MarkdownBlockCommandMenu"
import { MarkdownEditorToolbar } from "@/features/markdown/components/MarkdownEditorToolbar"
import { MarkdownSlashCommandMenu } from "@/features/markdown/components/MarkdownSlashCommandMenu"
import {
  createMarkdownTable,
  editorTheme,
  formatMarkdown,
  mapMarkdownPosition,
  markdownHighlightStyle,
  markdownMarkerHighlight,
  markdownReferenceHover,
  selectAllPreservingScrollPosition,
  synchronizeEditorToPreview,
  templateBlockFlash,
  templateBlockFlashEffect,
} from "@/features/markdown/extensions/markdownEditorExtensions"
import { getFileMentionDeletionRange } from "@/features/markdown/extensions/markdownFileMentions"
import {
  markdownFoldGutter,
  markdownHeadingFolding,
} from "@/features/markdown/extensions/markdownFolding"
import { useEditorScrollSync } from "@/features/markdown/hooks/useEditorScrollSync"
import { useMarkdownPanels } from "@/features/markdown/hooks/useMarkdownPanels"
import { LxMarkdownPreview } from "@/features/markdown/LxMarkdownPreview"
import type {
  LxMarkdownEditorProps,
  MarkdownPreviewMode,
  MarkdownToolbarAction,
} from "@/features/markdown/types"
import {
  markdownRenderer,
  stripEmptyTemplateItems,
  stripMarkdownTemplateComments,
} from "@/features/markdown/utils/markdownRenderer"
import { isMacOS } from "@/lib/platform"
import { rightSidebarStore } from "@/lib/rightSidebarStore"

// 模板块标题生成的加载占位文本（写入开始行「title: 」字段，兼作防重复触发与结果回写锚点）。
const TEMPLATE_TITLE_LOADING_TEXT = "⏳ 正在生成标题…"
// /summaryTitle 裸命令文本（trim 匹配用）。
const SUMMARY_COMMAND_TEXT = "/summaryTitle"

// 在文档中定位包含加载占位的行（即被写入「title: ⏳ 正在生成标题…」的开始行）；占位已消失时返回 null。
const findTitleLoadingLine = (view: EditorView): Line | null => {
  const markerIndex = view.state.doc.toString().indexOf(TEMPLATE_TITLE_LOADING_TEXT)
  return markerIndex < 0 ? null : view.state.doc.lineAt(markerIndex)
}

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
  // 跨页跳转目标模板块（范围来自目标页内容），页面内容就位后定位并闪烁高亮。
  const pendingJumpBlockRef = useRef<MarkdownTemplateBlockRange | null>(null)

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
  const isRightSidebarCollapsed = useSyncExternalStore(
    rightSidebarStore.subscribe,
    rightSidebarStore.isCollapsed,
  )
  pagesRef.current = pages
  activePageIndexRef.current = activePageIndex
  onPagesChangeRef.current = onPagesChange
  const pageModeRef = useRef(pageMode)
  pageModeRef.current = pageMode
  // 模板块标题生成进行中标记，防止并发重复触发。
  const isGeneratingTitleRef = useRef(false)

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
    if (view.state.doc.toString() !== nextContent) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: nextContent },
        // 页面切换不进入撤销历史。
        annotations: [Transaction.addToHistory.of(false)],
      })
    }
    // 跨页跳转：内容就位后定位到目标模板块开始行、滚动居中并闪烁高亮。
    if (pendingJumpBlockRef.current !== null) {
      const block = pendingJumpBlockRef.current
      pendingJumpBlockRef.current = null
      locateBlock(block)
    }
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

  /**
   * 将模板块整体滚动到编辑视口垂直中心，并同步预览滚动位置。
   */
  const scrollBlockToCenter = (view: EditorView, from: number, to: number): void => {
    if (view.state.doc.length === 0) return
    const firstLine = view.lineBlockAt(from)
    const lastLine = view.lineBlockAt(Math.max(from, to - 1))
    const blockTop = firstLine.top
    const blockHeight = lastLine.bottom - blockTop
    const viewportHeight = view.scrollDOM.clientHeight
    view.scrollDOM.scrollTop = blockTop - Math.max(0, (viewportHeight - blockHeight) / 2)
    if (previewRef.current) synchronizeEditorToPreview(view, previewRef.current)
  }

  /**
   * 将光标定位到模板块开始行，滚动块到视口中心并触发整块边框闪烁高亮。
   */
  const locateBlock = (block: MarkdownTemplateBlockRange): void => {
    const view = editorViewRef.current
    if (!view) return
    const docLength = view.state.doc.length
    const from = Math.min(block.start, docLength)
    const to = Math.min(block.end, docLength)

    view.dispatch({
      selection: { anchor: from },
      effects: templateBlockFlashEffect.of({ from, to }),
    })
    scrollBlockToCenter(view, from, to)
    view.focus()
  }

  /**
   * 将光标定位到指定页的模板块：同页直接定位，跨页先切页再在内容就位后定位。
   */
  const jumpToBlock = (pageIndex: number, block: MarkdownTemplateBlockRange): void => {
    if (pageIndex === activePageIndex) {
      locateBlock(block)
      return
    }
    pendingJumpBlockRef.current = block
    setActivePageIndex(pageIndex)
  }

  /**
   * 按方向与状态筛选环行查找模板块并跳转：
   * 当前页光标之后/之前 → 后续/前置页面页首/页尾 → 回绕当前页首/末块。
   * 定位后滚动到视口中心并对整块边框闪烁高亮。
   */
  const jumpToTemplateBlock = (
    direction: "previous" | "next",
    filter: MarkdownTemplateStatusFilter,
  ): void => {
    if (!pageMode || !pages?.length || !editorViewRef.current) return
    const pageCount = pages.length
    const currentIndex = Math.min(activePageIndex, pageCount - 1)
    const cursor = editorViewRef.current.state.selection.main.head

    const matchingBlocks = (index: number): MarkdownTemplateBlockRange[] =>
      getMarkdownTemplateBlockRanges(pages[index].content).filter(
        (block) => filter === "all" || block.status === filter,
      )

    const currentBlocks = matchingBlocks(currentIndex)
    // 当前页内光标之后的第一个 / 光标之前最后一个匹配块。
    const currentTarget =
      direction === "next"
        ? currentBlocks.find((block) => block.start > cursor)
        : [...currentBlocks].reverse().find((block) => block.start < cursor)
    if (currentTarget) {
      jumpToBlock(currentIndex, currentTarget)
      return
    }

    // 其他页面（环行）：向后取页首、向前取页尾第一个匹配块。
    const step = direction === "next" ? 1 : -1
    for (let distance = 1; distance < pageCount; distance += 1) {
      const pageIndex = (currentIndex + step * distance + pageCount) % pageCount
      const blocks = matchingBlocks(pageIndex)
      const target = direction === "next" ? blocks[0] : blocks[blocks.length - 1]
      if (target) {
        jumpToBlock(pageIndex, target)
        return
      }
    }

    // 回绕当前页：向后取首块、向前取末块（页内已无匹配）。
    const wrapTarget =
      direction === "next" ? currentBlocks[0] : currentBlocks[currentBlocks.length - 1]
    if (wrapTarget) jumpToBlock(currentIndex, wrapTarget)
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
    templateFilePanel,
    activeTemplateFileIndex,
    templateFilePanelRef,
    activeTemplateFileIndexRef,
    closeTemplateFilePanel,
    syncTemplateFilePanel,
    selectTemplateFile,
    handleTemplateFileKey,
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

  const isRightSidebarCollapsedRef = useRef(isRightSidebarCollapsed)
  useEffect(() => {
    isRightSidebarCollapsedRef.current = isRightSidebarCollapsed
  }, [isRightSidebarCollapsed])

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

  // 右侧栏展开时强制退出双栏模式，避免窄宽度下分屏不可用。
  useEffect(() => {
    if (isRightSidebarCollapsed || previewModeRef.current !== "split") return
    changePreviewMode("edit")
  }, [isRightSidebarCollapsed])

  /**
   * 循环切换模板块结束行的状态（未完成 -> 进行中 -> 已完成），作为状态持久化在源码中。
   */
  const cycleTemplateStatus = (line: number): void => {
    const view = editorViewRef.current
    if (!view) return

    const docLine = view.state.doc.line(line + 1)
    const nextLineText = cycleMarkdownTemplateStatus(docLine.text)
    if (nextLineText === null) return

    view.dispatch({ changes: { from: docLine.from, to: docLine.to, insert: nextLineText } })
  }

  /**
   * 触发模板块标题生成：取光标所在模板块内容，排除 /summaryTitle 命令行后按复制逻辑清洗，
   * 经 IPC 请求 main 进程生成标题。回车即移除 /summaryTitle 字样（保留所在行），
   * 加载占位写入开始行「title: 」字段；成功回写最终标题，失败恢复原标题并提示。
   */
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
    // 立即移除 /summaryTitle 字样，仅清空该行文本、保留所在行（不删除行）。
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
        templateBlockFlash,
        ...(showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
        ...(showFolding
          ? [foldState, markdownHeadingFolding, markdownFoldGutter, keymap.of(foldKeymap)]
          : []),
        // 模板块 id 只读：阻止对 id 文本的局部修改。零宽变更仅在光标位于 id 内部时阻止；
        // 非零宽变更仅当其范围完全落在 id 内时阻止，因此状态循环、整行/整块删除、整篇格式化等
        // 跨越 id 边界的合法操作不受影响，撤销（整行替换）同样放行。
        EditorState.transactionFilter.of((tr) => {
          if (!tr.docChanged) return tr
          const source = tr.startState.doc.toString()
          if (!source.includes("{id:")) return tr
          const idRanges = getMarkdownTemplateIdRanges(source)
          if (idRanges.length === 0) return tr

          let blocked = false
          tr.changes.iterChanges((from, to) => {
            if (blocked) return
            for (const range of idRanges) {
              if (from === to) {
                if (from > range.from && from < range.to) {
                  blocked = true
                  return
                }
              } else if (from >= range.from && to <= range.to) {
                blocked = true
                return
              }
            }
          })
          return blocked ? [] : tr
        }),
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
                handleBlockCommandKey(1) ||
                handleTemplateFileKey(1),
            },
            {
              key: "ArrowUp",
              run: () =>
                handleFileMentionKey("ArrowUp") ||
                handleSlashCommandKey(-1) ||
                handleBlockCommandKey(-1) ||
                handleTemplateFileKey(-1),
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

                const templateFilePanel = templateFilePanelRef.current
                if (templateFilePanel) {
                  selectTemplateFile(
                    templateFilePanel.files[activeTemplateFileIndexRef.current] ??
                      templateFilePanel.files[0],
                  )
                  return true
                }

                const cursor = view.state.selection.main.head
                const line = view.state.doc.lineAt(cursor)

                // 二次回车命令：模板块内 /summaryTitle 命令行触发标题生成。
                if (
                  isMarkdownConfirmCommandArmed(
                    line.text,
                    isInsideMarkdownTemplateBlock(view.state.doc.sliceString(0, line.from)),
                  )
                ) {
                  runTemplateTitleGeneration(view)
                  return true
                }
                const templateEndMatch =
                  /^(\s*)&&&(?:\s+(?:done|in_progress))?(?:\s+\{id:[0-9a-f]{32}\})?\s*$/.exec(
                    line.text,
                  )
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
                if (templateFilePanelRef.current) {
                  closeTemplateFilePanel()
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
          if (update.docChanged) {
            syncFileMentionPanel(update.view)
            syncTemplateFilePanel(update.view)
          }
          if (update.selectionSet && !update.docChanged) {
            closeFileMentionPanel()
            closeTemplateFilePanel()
          }
          if (update.docChanged) {
            const nextContent = update.state.doc.toString()
            setContent(nextContent)
            const activeIndex = activePageIndexRef.current
            if (pageMode && pagesRef.current && pagesRef.current[activeIndex]) {
              onPagesChangeRef.current?.(
                pagesRef.current.map((page, index) =>
                  index === activeIndex ? { ...page, content: nextContent } : page,
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
    {
      icon: SquareSplitHorizontal,
      label: splitLabel,
      onClick: () => changePreviewMode(previewMode === "split" ? "edit" : "split"),
      alignRight: true,
      highlighted: previewMode === "split",
      disabled: !isRightSidebarCollapsed,
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
        onJumpToTemplateBlock={jumpToTemplateBlock}
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
            onTemplateStatusToggle={cycleTemplateStatus}
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
      <FileMentionCommandMenu
        activeIndex={activeTemplateFileIndex}
        files={templateFilePanel?.files}
        idPrefix="markdown-template-file"
        label="模板块文件快捷输入"
        position={templateFilePanel?.position}
        visible={Boolean(templateFilePanel)}
      />
    </section>
  )
}
