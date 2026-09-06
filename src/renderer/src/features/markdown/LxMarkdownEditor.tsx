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
  Prec,
  StateEffect,
  StateField,
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
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { useGitWorktrees } from "@/features/git"
import {
  getMarkdownTemplateIdRanges,
  getMarkdownTemplateWtRanges,
} from "@/features/markdown/commands/markdownBlockCommands"
import { MarkdownEditorToolbar } from "@/features/markdown/components/MarkdownEditorToolbar"
import { MarkdownStatusBar } from "@/features/markdown/components/MarkdownStatusBar"
import {
  createMarkdownTable,
  editorTheme,
  markdownHighlightStyle,
  markdownMarkerHighlight,
  markdownReferenceHover,
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
import { markdownRenderer } from "@/features/markdown/utils/markdownRenderer"
import { useTranslation } from "@/i18n"
import { getClipboardFilesAsync } from "@/lib/clipboard"
import { isMacOS } from "@/lib/platform"
import { rightSidebarStore } from "@/lib/rightSidebarStore"
import { MarkdownEditorPanels } from "./components/MarkdownEditorPanels"
import { useMarkdownActions } from "./hooks/useMarkdownActions"
import {
  buildMarkdownEditorPrecKeymap,
  buildMarkdownEditorStandardKeymap,
  useMarkdownGlobalShortcuts,
} from "./hooks/useMarkdownKeymap"
import { useMarkdownPages } from "./hooks/useMarkdownPages"

import { undo, redo } from "@codemirror/commands"
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
  const { success: showToastSuccess, success, warning, error } = useLxToast()
  const showToastSuccessRef = useRef(showToastSuccess)
  showToastSuccessRef.current = showToastSuccess
  const { t, locale } = useTranslation()

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

  const {
    content,
    setContent,
    activePageIndex,
    pageName,
    pagesRef,
    activePageIndexRef,
    pageModeRef,
    onPagesChangeRef,
    switchPageRef,
    createPageRef,
    switchPage,
    createPage,
    renamePage,
    deletePage,
    reorderPage,
  } = useMarkdownPages({
    itemId,
    initialContent,
    pages,
    pageMode,
    editorViewRef,
    scrollToBottom,
    onPagesChange,
  })

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

  const scrollToLine = useCallback((line: number): void => {
    const view = editorViewRef.current
    if (!view) return
    try {
      const docLines = view.state.doc.lines
      const safeLine = Math.max(1, Math.min(line, docLines))
      const lineInfo = view.state.doc.line(safeLine)

      view.dispatch({
        selection: { anchor: lineInfo.from },
        effects: flashLineEffect.of({ line: safeLine }),
      })

      const block = view.lineBlockAt(lineInfo.from)
      const containerHeight = view.scrollDOM.clientHeight
      const targetScrollTop = Math.max(0, block.top - containerHeight * 0.3)

      view.scrollDOM.scrollTo({
        top: targetScrollTop,
        behavior: "auto",
      })

      view.focus()
    } catch (e) {
      console.error("Failed to scroll to line", line, e)
    }
  }, [])

  const isRightSidebarCollapsed = useSyncExternalStore(
    rightSidebarStore.subscribe,
    rightSidebarStore.isCollapsed,
  )
  const { worktrees, projectBranch, reload: reloadWorktrees } = useGitWorktrees(projectPath)

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
      argumentHint: cmd.argumentHint,
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
    sendPromptPanel,
    activeSendPromptIndex,
    sendPromptFlagPanel,
    activeSendPromptFlagIndex,
    fileMentionPanel,
    activeFileMentionIndex,
    blockCommandPanelRef,
    slashCommandPanelRef,
    gitWorktreePanelRef,
    sendPromptPanelRef,
    sendPromptFlagPanelRef,
    fileMentionPanelRef,
    closeFileMentionPanel,
    closeSlashCommandPanel,
    closeGitWorktreePanel,
    closeSendPromptPanel,
    closeSendPromptFlagPanel,
    syncSlashCommandPanel,
    selectSlashCommand,
    handleSlashCommandKey,
    selectGitWorktree,
    handleGitWorktreeKey,
    selectSendPrompt,
    handleSendPromptKey,
    selectSendPromptFlag,
    handleSendPromptFlagKey,
    syncFileMentionPanel,
    selectFileMention,
    handleFileMentionKey,
    templateFilePanel,
    activeTemplateFileIndex,
    templateFilePanelRef,
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

  const changePreviewMode = useCallback(
    (mode: MarkdownPreviewMode): void => {
      captureScrollAnchor()
      setPreviewMode(mode)
    },
    [captureScrollAnchor],
  )

  const previewModeRef = useRef(previewMode)
  useEffect(() => {
    previewModeRef.current = previewMode
  }, [previewMode])

  const isRightSidebarCollapsedRef = useRef(isRightSidebarCollapsed)
  useEffect(() => {
    isRightSidebarCollapsedRef.current = isRightSidebarCollapsed
  }, [isRightSidebarCollapsed])

  useMarkdownGlobalShortcuts({
    previewModeRef,
    isRightSidebarCollapsedRef,
    pageModeRef,
    pagesRef,
    activePageIndexRef,
    changePreviewMode,
    switchPageRef,
    createPageRef,
    onEmptyPageWarning: () => warning("当前页内容为空，请先输入内容再创建下一页"),
  })

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  const {
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
  } = useMarkdownActions({
    editorViewRef,
    projectPath,
    worktreePath,
    worktreesRef,
    projectBranchRef,
    projectPathRef,
    onWorktreePathChangeRef,
    captureScrollAnchor,
    t,
    toast: { success, warning, error },
  })

  // 右侧栏展开时强制退出双栏模式，避免窄宽度下分屏不可用。
  useEffect(() => {
    if (isRightSidebarCollapsed || previewModeRef.current !== "split") return
    changePreviewMode("edit")
  }, [changePreviewMode, isRightSidebarCollapsed])

  useEffect(() => {
    const container = editorContainerRef.current
    if (!container) return

    const keymapContext = {
      pasteReferencePanelRef,
      activePasteReferenceIndexRef,
      fileMentionPanelRef,
      activeFileMentionIndexRef: { current: activeFileMentionIndex },
      gitWorktreePanelRef,
      activeGitWorktreeIndexRef: { current: activeGitWorktreeIndex },
      sendPromptPanelRef,
      activeSendPromptIndexRef: { current: activeSendPromptIndex },
      sendPromptFlagPanelRef,
      activeSendPromptFlagIndexRef: { current: activeSendPromptFlagIndex },
      slashCommandPanelRef,
      activeSlashCommandIndexRef: { current: activeSlashCommandIndex },
      blockCommandPanelRef,
      activeBlockCommandIndexRef: { current: activeBlockCommandIndex },
      templateFilePanelRef,
      activeTemplateFileIndexRef: { current: activeTemplateFileIndex },
      handlePasteReferenceKey,
      selectPasteReference,
      closePasteReferencePanel,
      handleFileMentionKey,
      selectFileMention,
      closeFileMentionPanel,
      handleGitWorktreeKey,
      selectGitWorktree,
      closeGitWorktreePanel,
      handleSendPromptKey,
      selectSendPrompt,
      closeSendPromptPanel,
      handleSendPromptFlagKey,
      selectSendPromptFlag,
      closeSendPromptFlagPanel,
      handleSlashCommandKey,
      selectSlashCommand,
      closeSlashCommandPanel,
      handleBlockCommandKey,
      selectBlockCommand,
      setBlockCommandPanel,
      handleTemplateFileKey,
      selectTemplateFile,
      closeTemplateFilePanel,
      formattedCustomSlashCommands,
      runSendPromptDispatch,
      runGitWorktreeSwitch,
      runTemplateTitleGeneration,
      insertText,
      wrapSelection,
      insertCodeBlock,
      formatDocument,
      prefixLines,
      addHeading,
      onSaveRef,
      showToastSuccess: (msg: string) => showToastSuccessRef.current(msg),
      t,
    }

    const state = EditorState.create({
      doc: content,
      selection: { anchor: content.length },
      extensions: [
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
        Prec.highest(keymap.of(buildMarkdownEditorPrecKeymap(keymapContext))),
        Prec.high(
          EditorView.domEventHandlers({
            paste: (event, view) => {
              const clipboardData = event.clipboardData
              const hasItems =
                clipboardData &&
                (clipboardData.files.length > 0 ||
                  Array.from(clipboardData.items).some((i) => i.kind === "file") ||
                  clipboardData.getData("text/plain").trim().startsWith("/") ||
                  clipboardData.getData("text/uri-list").includes("file://"))

              if (!hasItems) return false

              event.preventDefault()
              void getClipboardFilesAsync(event).then((files) => {
                if (files.length === 0) return
                const { from, to } = view.state.selection.main
                const prevChar = from > 0 ? view.state.doc.sliceString(from - 1, from) : ""
                const leadingSpace = prevChar && !/\s/.test(prevChar) ? " " : ""
                const referenceInsertion = `${leadingSpace}${files
                  .map(({ path, type }) => `@${type}:${path}`)
                  .join(" ")} `
                const insertion = `${leadingSpace}${files.map(({ path }) => path).join(" ")} `
                const coords = view.coordsAtPos(from)
                if (!coords) return

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
                view.focus()
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
        keymap.of(buildMarkdownEditorStandardKeymap(keymapContext)),
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
      <MarkdownEditorPanels
        pasteReferencePanel={pasteReferencePanel}
        activePasteReferenceIndex={activePasteReferenceIndex}
        blockCommandPanel={blockCommandPanel}
        activeBlockCommandIndex={activeBlockCommandIndex}
        slashCommandPanel={slashCommandPanel}
        activeSlashCommandIndex={activeSlashCommandIndex}
        gitWorktreePanel={gitWorktreePanel}
        activeGitWorktreeIndex={activeGitWorktreeIndex}
        sendPromptPanel={sendPromptPanel}
        activeSendPromptIndex={activeSendPromptIndex}
        sendPromptFlagPanel={sendPromptFlagPanel}
        activeSendPromptFlagIndex={activeSendPromptFlagIndex}
        fileMentionPanel={fileMentionPanel}
        activeFileMentionIndex={activeFileMentionIndex}
        templateFilePanel={templateFilePanel}
        activeTemplateFileIndex={activeTemplateFileIndex}
        t={t as any}
      />
    </section>
  )
}
