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
import {
  EditorState,
  type Line,
  Prec,
  StateEffect,
  StateField,
  Transaction,
} from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  EditorView,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import type { MarkdownTemplateCommandItem } from "@shared/contracts/markdown"
import { Eye, Redo2, SquareSplitHorizontal, Undo2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { GitWorktreeCommandMenu, resolveGitWorktreeTarget, useGitWorktrees } from "@/features/git"
import {
  cycleMarkdownTemplateStatus,
  getMarkdownTemplateBlockContent,
  getMarkdownTemplateBlockEndLine,
  getMarkdownTemplateBlockStartLine,
  getMarkdownTemplateIdRanges,
  getMarkdownTemplateWtRanges,
  isInsideMarkdownTemplateBlock,
  setMarkdownTemplateTitle,
  setMarkdownTemplateWorktree,
  toggleMarkdownTemplateCommentLines,
} from "@/features/markdown/commands/markdownBlockCommands"
import { createMarkdownReference } from "@/features/markdown/commands/markdownReferenceCommands"
import {
  getMarkdownArmedSlashCommand,
  getMarkdownSelectCommandValue,
} from "@/features/markdown/commands/markdownSlashCommands"
import { FileMentionCommandMenu } from "@/features/markdown/components/FileMentionCommandMenu"
import { MarkdownBlockCommandMenu } from "@/features/markdown/components/MarkdownBlockCommandMenu"
import { MarkdownEditorToolbar } from "@/features/markdown/components/MarkdownEditorToolbar"
import {
  buildPasteReferenceOptions,
  MarkdownPasteCommandMenu,
} from "@/features/markdown/components/MarkdownPasteCommandMenu"
import { MarkdownSlashCommandMenu } from "@/features/markdown/components/MarkdownSlashCommandMenu"
import { MarkdownStatusBar } from "@/features/markdown/components/MarkdownStatusBar"
import {
  createMarkdownTable,
  editorTheme,
  formatMarkdown,
  mapMarkdownPosition,
  markdownHighlightStyle,
  markdownMarkerHighlight,
  markdownReferenceHover,
  selectAllPreservingScrollPosition,
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
import { useTranslation } from "@/i18n"
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
const getClipboardFiles = (
  event: ClipboardEvent,
): { path: string; type: "folder" | "file" | "image" }[] => {
  const clipboardData = event.clipboardData
  if (!clipboardData) return []

  const files = Array.from(clipboardData.files)
  const entries = Array.from(clipboardData.items).filter(
    (clipboardItem) => clipboardItem.kind === "file",
  )
  const clipboardFiles = files.flatMap((file, index) => {
    try {
      const path = window.api.getPathForFile(file)
      if (!path) return []
      const entry = (
        entries[index] as
          | (DataTransferItem & { webkitGetAsEntry?: () => { isDirectory: boolean } | null })
          | undefined
      )?.webkitGetAsEntry?.()
      const isImage =
        file.type.startsWith("image/") || /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(path)
      const fileType: "image" | "file" | "folder" = entry?.isDirectory
        ? "folder"
        : isImage
          ? "image"
          : "file"
      return [{ path, type: fileType }]
    } catch {
      return []
    }
  })
  if (clipboardFiles.length > 0) return clipboardFiles

  const plainText = clipboardData.getData("text/plain").trim()
  if (plainText.startsWith("/")) {
    return [
      {
        path: plainText,
        type: /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(plainText) ? "image" : "file",
      },
    ]
  }

  const fileUri = clipboardData
    .getData("text/uri-list")
    .split(/\r?\n/)
    .find((value) => value.trim() && !value.trim().startsWith("#"))
  if (!fileUri?.startsWith("file://")) return []

  try {
    const path = decodeURIComponent(new URL(fileUri.trim()).pathname)
    return [
      {
        path,
        type: /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(path) ? "image" : "file",
      },
    ]
  } catch {
    return []
  }
}

// --- CodeMirror Line Flash Highlight State ---
export const flashLineEffect = StateEffect.define<{ line: number }>()

const lineFlashField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(value, tr) {
    value = value.map(tr.changes)
    for (const effect of tr.effects) {
      if (effect.is(flashLineEffect)) {
        const lineNum = Math.max(1, Math.min(effect.value.line, tr.state.doc.lines))
        const line = tr.state.doc.line(lineNum)
        const deco = Decoration.line({
          class: "cm-md-line-flash",
        })
        value = Decoration.none.update({
          add: [deco.range(line.from)],
        })
      }
    }
    return value
  },
  provide: (f) => EditorView.decorations.from(f),
})

/**
 * 渲染可编辑、预览和分栏浏览模式的 Markdown 编辑器。
 */
export const LxMarkdownEditor = ({
  itemId,
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
  onSearchDirectoryFiles,
  referencedProjectPaths,
  projectPath,
  worktreePath,
  onWorktreePathChange,
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

  const [content, setContent] = useState(() => {
    if (pageMode && pages?.length) {
      let index = pages.length - 1
      if (itemId) {
        const saved = localStorage.getItem(`lx-md-active-page-${itemId}`)
        if (saved !== null) {
          const parsed = parseInt(saved, 10)
          if (parsed >= 0 && parsed < pages.length) {
            index = parsed
          }
        }
      }
      return pages[index]?.content ?? initialContent
    }
    return initialContent
  })
  const [activePageIndex, setActivePageIndex] = useState(() => {
    if (pageMode && pages?.length) {
      if (itemId) {
        const saved = localStorage.getItem(`lx-md-active-page-${itemId}`)
        if (saved !== null) {
          const parsed = parseInt(saved, 10)
          if (parsed >= 0 && parsed < pages.length) {
            return parsed
          }
        }
      }
      return pages.length - 1
    }
    return 0
  })
  const [pageName, setPageName] = useState("")
  const [previewMode, setPreviewMode] = useState<MarkdownPreviewMode>("edit")
  const [activeLine, setActiveLine] = useState(1)
  const [pasteReferencePanel, setPasteReferencePanel] = useState<{
    from: number
    to: number
    insertion: string
    referenceInsertion: string
    originalText: string
    paths: { path: string; type: "folder" | "file" | "image" }[]
    position: { left: number; top: number | string; bottom: number | string }
  } | null>(null)
  const [activePasteReferenceIndex, setActivePasteReferenceIndex] = useState(0)
  const pasteReferencePanelRef = useRef(pasteReferencePanel)
  const activePasteReferenceIndexRef = useRef(0)
  pasteReferencePanelRef.current = pasteReferencePanel

  const closePasteReferencePanel = (restore = true): void => {
    const view = editorViewRef.current
    const panel = pasteReferencePanelRef.current
    if (restore && view && panel) {
      view.dispatch({
        changes: {
          from: panel.from,
          to: panel.from + panel.insertion.length,
          insert: panel.originalText,
        },
        selection: { anchor: panel.from + panel.originalText.length },
      })
      view.focus()
    }
    pasteReferencePanelRef.current = null
    activePasteReferenceIndexRef.current = 0
    setPasteReferencePanel(null)
    setActivePasteReferenceIndex(0)
  }

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (!pasteReferencePanelRef.current) return
      if (editorContainerRef.current?.contains(event.target as Node)) return
      closePasteReferencePanel()
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  const handlePasteReferenceKey = (offset: number): boolean => {
    const panel = pasteReferencePanelRef.current
    if (!panel) return false
    const nextIndex = (activePasteReferenceIndexRef.current + offset + 2) % 2
    activePasteReferenceIndexRef.current = nextIndex
    setActivePasteReferenceIndex(nextIndex)
    return true
  }

  const selectPasteReference = (mode: "reference" | "path"): boolean => {
    const view = editorViewRef.current
    const panel = pasteReferencePanelRef.current
    if (!view || !panel) return false

    const text = mode === "reference" ? panel.referenceInsertion : panel.insertion
    view.dispatch({
      changes: { from: panel.from, to: panel.from + panel.insertion.length, insert: text },
      selection: { anchor: panel.from + text.length },
      userEvent: "input.paste",
    })
    view.focus()
    closePasteReferencePanel(false)
    return true
  }

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
  }, [])

  const scrollToLine = useCallback((line: number): void => {
    const view = editorViewRef.current
    if (!view) return
    try {
      const docLines = view.state.doc.lines
      const safeLine = Math.max(1, Math.min(line, docLines))
      const lineInfo = view.state.doc.line(safeLine)

      // Move selection/cursor and dispatch the line flash effect
      view.dispatch({
        selection: { anchor: lineInfo.from },
        effects: flashLineEffect.of({ line: safeLine }),
      })

      // Calculate position for direct instant jump (center-to-upper: 30% from the top of viewport)
      const block = view.lineBlockAt(lineInfo.from)
      const containerHeight = view.scrollDOM.clientHeight
      const targetScrollTop = Math.max(0, block.top - containerHeight * 0.3)

      // Instant jump (no smooth behavior)
      view.scrollDOM.scrollTo({
        top: targetScrollTop,
        behavior: "auto",
      })

      view.focus()
    } catch (e) {
      console.error("Failed to scroll to line", line, e)
    }
  }, [])
  const { success, warning, error } = useLxToast()
  const { t, locale } = useTranslation()
  const isRightSidebarCollapsed = useSyncExternalStore(
    rightSidebarStore.subscribe,
    rightSidebarStore.isCollapsed,
  )
  // 项目仓库工作区列表（/gitWorktree 二级面板与 @ 搜索上下文共用）。
  const { worktrees, projectBranch, reload: reloadWorktrees } = useGitWorktrees(projectPath)
  pagesRef.current = pages
  activePageIndexRef.current = activePageIndex
  onPagesChangeRef.current = onPagesChange
  const pageModeRef = useRef(pageMode)
  pageModeRef.current = pageMode
  // git 工作区切换依赖的可变值：EditorState keymap 闭包在首次渲染创建后不再更新，
  // 通过 ref 持有最新值，供回车触发的 runGitWorktreeSwitch 读取。
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
        selection: { anchor: nextContent.length },
        scrollIntoView: true,
        // 页面切换不进入撤销历史。
        annotations: [Transaction.addToHistory.of(false)],
      })
      scrollToBottom()
    }
  }, [activePage, pageMode, scrollToBottom])

  const switchPage = (index: number): void => {
    if (!pages || index < 0 || index >= pages.length || index === activePageIndex) return
    setActivePageIndex(index)
    if (itemId) {
      localStorage.setItem(`lx-md-active-page-${itemId}`, index.toString())
    }
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
    const nextIndex = nextPages.length - 1
    setActivePageIndex(nextIndex)
    if (itemId) {
      localStorage.setItem(`lx-md-active-page-${itemId}`, nextIndex.toString())
    }
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
    const nextIndex = Math.min(activePageIndex, nextPages.length - 1)
    setActivePageIndex(nextIndex)
    if (itemId) {
      localStorage.setItem(`lx-md-active-page-${itemId}`, nextIndex.toString())
    }
  }

  /**
   * 拖拽排序：将 fromIndex 页面移动到 toIndex，当前页跟随原页面移动。
   */
  const reorderPage = (fromIndex: number, toIndex: number): void => {
    if (
      !pages ||
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= pages.length ||
      toIndex >= pages.length
    )
      return
    const nextPages = [...pages]
    const [movedPage] = nextPages.splice(fromIndex, 1)
    nextPages.splice(toIndex, 0, movedPage)
    onPagesChangeRef.current?.(nextPages)

    let nextIndex = activePageIndex
    if (activePageIndex === fromIndex) {
      nextIndex = toIndex
    } else if (fromIndex < activePageIndex && activePageIndex <= toIndex) {
      nextIndex = activePageIndex - 1
    } else if (toIndex <= activePageIndex && activePageIndex < fromIndex) {
      nextIndex = activePageIndex + 1
    }
    setActivePageIndex(nextIndex)
    if (itemId) {
      localStorage.setItem(`lx-md-active-page-${itemId}`, nextIndex.toString())
    }
  }

  const switchPageRef = useRef(switchPage)
  const createPageRef = useRef(createPage)
  switchPageRef.current = switchPage
  createPageRef.current = createPage

  const [customMarkdownCommands, setCustomMarkdownCommands] = useState<
    MarkdownTemplateCommandItem[]
  >([])

  useEffect(() => {
    let active = true
    window.api?.markdown
      ?.listMarkdownCommands?.(projectPath)
      ?.then((cmds) => {
        if (active) setCustomMarkdownCommands(cmds)
      })
      ?.catch(() => {})
    return () => {
      active = false
    }
  }, [projectPath])

  const formattedCustomSlashCommands = useMemo(() => {
    return customMarkdownCommands.map((cmd) => ({
      id: `custom:${cmd.name}`,
      label: `/${cmd.name}`,
      description: cmd.description,
      content: cmd.content,
      cursorOffset: cmd.content.length,
      scope: (cmd.scope === "template" ? "template" : "both") as "template" | "both",
      kind: "customTemplate" as const,
      source: cmd.source,
      customScope: cmd.scope,
    }))
  }, [customMarkdownCommands])

  const {
    blockCommandPanel,
    activeBlockCommandIndex,
    slashCommandPanel,
    activeSlashCommandIndex,
    gitWorktreePanel,
    activeGitWorktreeIndex,
    fileMentionPanel,
    activeFileMentionIndex,
    blockCommandPanelRef,
    activeBlockCommandIndexRef,
    slashCommandPanelRef,
    activeSlashCommandIndexRef,
    gitWorktreePanelRef,
    activeGitWorktreeIndexRef,
    fileMentionPanelRef,
    activeFileMentionIndexRef,
    closeFileMentionPanel,
    closeSlashCommandPanel,
    closeGitWorktreePanel,
    syncSlashCommandPanel,
    selectSlashCommand,
    handleSlashCommandKey,
    selectGitWorktree,
    handleGitWorktreeKey,
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
    onSearchDirectoryFiles,
    referencedProjectPaths,
    projectPath,
    worktreePath,
    worktrees,
    projectBranch,
    reloadWorktrees,
    customSlashCommands: formattedCustomSlashCommands,
    locale,
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

  /**
   * 触发 git 工作区切换：解析 /gitWorktree <分支名> 命令行。
   * 模板块内为局部切换（写/移除当前块结束行 {wt:}）；块外为全局切换（回调 onWorktreePathChange 持久化）。
   * 成功后清除命令行并提示；目标工作区不存在时保留命令行并提示错误。
   */
  const runGitWorktreeSwitch = (view: EditorView): void => {
    const docText = view.state.doc.toString()
    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    const isInsideTemplate = isInsideMarkdownTemplateBlock(view.state.doc.sliceString(0, line.from))
    const branch = getMarkdownSelectCommandValue(line.text, isInsideTemplate)
    // keymap 闭包为首次渲染捕获，这里必须从 ref 读取最新工作区数据。
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

    // 清除命令行（保留行），避免切换成功/失败后残留命令文本。
    const clearCommandLine = (): void => {
      const commandLine = view.state.doc.lineAt(cursor)
      if (commandLine.text.trim() === "") return
      view.dispatch({
        changes: { from: commandLine.from, to: commandLine.to, insert: "" },
        selection: { anchor: commandLine.from },
      })
    }

    if (isInsideTemplate) {
      // 模板块局部切换：写/移除当前块结束行的 {wt:分支名}。
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

    // 全局切换：回调持久化到条目；默认工作区传 null 解除绑定。等待结果据实提示。
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
  }

  useEffect(() => {
    const container = editorContainerRef.current
    if (!container) return

    const state = EditorState.create({
      doc: content,
      selection: { anchor: content.length },
      extensions: [
        history(),
        markdown({
          codeLanguages: languages,
          extensions: [GFM, { remove: ["SetextHeading"] }],
        }),
        syntaxHighlighting(markdownHighlightStyle),
        editorTheme,
        lineFlashField,
        markdownReferenceHover,
        markdownMarkerHighlight(showFolding, () => referencedRootsRef.current),
        ...(showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
        ...(showFolding
          ? [foldState, markdownHeadingFolding, markdownFoldGutter, keymap.of(foldKeymap)]
          : []),
        // 模板块 id / 工作区绑定只读：阻止对 {id:...} 与 {wt:...} 文本的局部修改。零宽变更仅在光标
        // 位于其内部时阻止；非零宽变更仅当其范围完全落在其内部时阻止，因此状态循环、整行/整块删除、
        // 整篇格式化等跨越边界的合法操作不受影响，撤销（整行替换）同样放行。
        EditorState.transactionFilter.of((tr) => {
          if (!tr.docChanged) return tr
          const source = tr.startState.doc.toString()
          if (!source.includes("{id:") && !source.includes("{wt:")) return tr
          const protectedRanges = [
            ...getMarkdownTemplateIdRanges(source),
            ...getMarkdownTemplateWtRanges(source),
          ]
          if (protectedRanges.length === 0) return tr

          let blocked = false
          tr.changes.iterChanges((from, to) => {
            if (blocked) return
            for (const range of protectedRanges) {
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
                handlePasteReferenceKey(1) ||
                handleFileMentionKey("ArrowDown") ||
                handleGitWorktreeKey(1) ||
                handleSlashCommandKey(1) ||
                handleBlockCommandKey(1) ||
                handleTemplateFileKey(1),
            },
            {
              key: "ArrowUp",
              run: () =>
                handlePasteReferenceKey(-1) ||
                handleFileMentionKey("ArrowUp") ||
                handleGitWorktreeKey(-1) ||
                handleSlashCommandKey(-1) ||
                handleBlockCommandKey(-1) ||
                handleTemplateFileKey(-1),
            },
            {
              key: "Enter",
              run: (view) => {
                const pastePanel = pasteReferencePanelRef.current
                if (pastePanel) {
                  return selectPasteReference(
                    activePasteReferenceIndexRef.current === 0 ? "reference" : "path",
                  )
                }

                const fileMention = fileMentionPanelRef.current
                if (fileMention) {
                  selectFileMention(
                    fileMention.files[activeFileMentionIndexRef.current] ?? fileMention.files[0],
                  )
                  return true
                }

                const gitWorktree = gitWorktreePanelRef.current
                if (gitWorktree) {
                  selectGitWorktree(
                    gitWorktree.options[activeGitWorktreeIndexRef.current] ??
                      gitWorktree.options[0],
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
                const isInsideTemplate = isInsideMarkdownTemplateBlock(
                  view.state.doc.sliceString(0, line.from),
                )

                // 二次回车命令：模板块内 /summaryTitle 命令行触发标题生成；/gitWorktree 命令行触发工作区切换。
                const armedCommand = getMarkdownArmedSlashCommand(line.text, isInsideTemplate)
                if (armedCommand) {
                  if (armedCommand.kind === "select") {
                    runGitWorktreeSwitch(view)
                  } else {
                    runTemplateTitleGeneration(view)
                  }
                  return true
                }
                const templateEndMatch =
                  /^(\s*)&&&(?:\s+(?:done|in_progress))?(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$/.exec(
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
              key: "Escape",
              run: () => {
                if (pasteReferencePanelRef.current) {
                  closePasteReferencePanel()
                  return true
                }
                if (fileMentionPanelRef.current) {
                  closeFileMentionPanel()
                  return true
                }
                if (slashCommandPanelRef.current) {
                  closeSlashCommandPanel()
                  return true
                }
                if (gitWorktreePanelRef.current) {
                  closeGitWorktreePanel()
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
              const files = getClipboardFiles(event)
              if (files.length === 0) return false

              event.preventDefault()
              const { from, to } = view.state.selection.main
              const prevChar = from > 0 ? view.state.doc.sliceString(from - 1, from) : ""
              const leadingSpace = prevChar && !/\s/.test(prevChar) ? " " : ""
              const referenceInsertion = `${leadingSpace}${files
                .map(({ path, type }) => createMarkdownReference(type, path))
                .join(" ")} `
              const insertion = `${leadingSpace}${files.map(({ path }) => path).join(" ")} `
              const coords = view.coordsAtPos(from)
              if (!coords) return true

              const panel = {
                from,
                to,
                insertion,
                referenceInsertion,
                originalText: view.state.doc.sliceString(from, to),
                paths: files,
                position: {
                  left: Math.max(8, coords.left),
                  top: coords.bottom + 6,
                  bottom: "auto",
                },
              }
              pasteReferencePanelRef.current = panel
              activePasteReferenceIndexRef.current = 0
              setPasteReferencePanel(panel)
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
          if (pasteReferencePanelRef.current) {
            const panel = pasteReferencePanelRef.current
            const currentDoc = update.state.doc.toString()
            const insertedText = currentDoc.slice(panel.from, panel.from + panel.insertion.length)
            const cursor = update.state.selection.main.head
            const isCursorInRange =
              cursor >= panel.from && cursor <= panel.from + panel.insertion.length
            if (insertedText !== panel.insertion || !isCursorInRange) {
              pasteReferencePanelRef.current = null
              activePasteReferenceIndexRef.current = 0
              setPasteReferencePanel(null)
              setActivePasteReferenceIndex(0)
            }
          }
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

    let ticking = false
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (editorViewRef.current) {
            const { scrollTop } = editorViewRef.current.scrollDOM
            try {
              const block = editorViewRef.current.lineBlockAtHeight(scrollTop + 20)
              const lineNum = editorViewRef.current.state.doc.lineAt(block.from).number
              setActiveLine(lineNum)
            } catch (e) {
              // Ignore layout/metrics errors during transitions
            }
          }
          ticking = false
        })
        ticking = true
      }
    }

    view.scrollDOM.addEventListener("scroll", handleScroll, { passive: true })
    // Initialize active line on load
    handleScroll()
    scrollToBottom()

    return () => {
      view.scrollDOM.removeEventListener("scroll", handleScroll)
      editorViewRef.current = null
      view.destroy()
    }
  }, [showLineNumbers, showFolding])

  const splitLabel = t("markdown.splitViewShortcut", {
    shortcut: isMacOS() ? "Cmd+Shift+E" : "Ctrl+Shift+E",
  })
  const previewLabel = t("markdown.previewShortcut", {
    shortcut: isMacOS() ? "Cmd+Shift+V" : "Ctrl+Shift+V",
  })

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
    <section className="flex min-h-[70px] min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
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
        onPageReorder={reorderPage}
        content={content}
        activeLine={activeLine}
        onScrollToLine={scrollToLine}
      />
      <div className="markdown-editor-workspace min-h-0 flex flex-1 overflow-hidden text-sm">
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
      <MarkdownStatusBar projectPath={worktreePath ?? projectPath} />
      <MarkdownPasteCommandMenu
        activeIndex={activePasteReferenceIndex}
        options={
          pasteReferencePanel ? buildPasteReferenceOptions(pasteReferencePanel.paths, t) : undefined
        }
        position={pasteReferencePanel?.position}
        visible={Boolean(pasteReferencePanel)}
      />
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
      <GitWorktreeCommandMenu
        activeIndex={activeGitWorktreeIndex}
        options={gitWorktreePanel?.options}
        position={gitWorktreePanel?.position}
        visible={Boolean(gitWorktreePanel)}
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
