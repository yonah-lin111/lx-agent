import { history, redo, redoDepth, undo, undoDepth } from "@codemirror/commands"
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
import { Compartment, EditorState } from "@codemirror/state"
import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import type { MarkdownTemplateCommandItem } from "@shared/contracts/markdown"
import { Eye, Redo2, SquareSplitHorizontal, Undo2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { useGitWorktrees } from "@/features/git"
import { parseMarkdownVariables } from "@/features/markdown/commands/markdownVariableCommands"
import { MarkdownCommandPanels } from "@/features/markdown/components/MarkdownCommandPanels"
import { MarkdownEditorToolbar } from "@/features/markdown/components/MarkdownEditorToolbar"
import { MarkdownStatusBar } from "@/features/markdown/components/MarkdownStatusBar"
import {
  createMarkdownTable,
  editorTheme,
  markdownHighlightStyle,
  markdownMarkerHighlight,
  markdownReferenceHover,
} from "@/features/markdown/extensions/markdownEditorExtensions"
import { createMarkdownEditorKeymaps } from "@/features/markdown/extensions/markdownEditorKeymap"
import { lineFlashField } from "@/features/markdown/extensions/markdownFlashLine"
import {
  markdownFoldGutter,
  markdownHeadingFolding,
} from "@/features/markdown/extensions/markdownFolding"
import { useEditorScrollSync } from "@/features/markdown/hooks/useEditorScrollSync"
import { useMarkdownEditorActions } from "@/features/markdown/hooks/useMarkdownEditorActions"
import { useMarkdownPages } from "@/features/markdown/hooks/useMarkdownPages"
import { useMarkdownPanels } from "@/features/markdown/hooks/useMarkdownPanels"
import { useMarkdownPasteReference } from "@/features/markdown/hooks/useMarkdownPasteReference"
import { LxMarkdownPreview } from "@/features/markdown/LxMarkdownPreview"
import type {
  LxMarkdownEditorProps,
  MarkdownPreviewMode,
  MarkdownToolbarAction,
} from "@/features/markdown/types"
import { markdownRenderer } from "@/features/markdown/utils/markdownRenderer"
import { useTranslation } from "@/i18n"
import { isMacOS } from "@/lib/platform"
import { rightSidebarStore } from "@/lib/rightSidebarStore"

export { flashLineEffect } from "@/features/markdown/extensions/markdownFlashLine"

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
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const { success, warning, error } = useLxToast()
  const { t, locale } = useTranslation()
  const showToastSuccessRef = useRef(success)
  showToastSuccessRef.current = success
  const showToastWarningRef = useRef(warning)
  showToastWarningRef.current = warning
  const tRef = useRef(t)
  tRef.current = t

  const isRightSidebarCollapsed = useSyncExternalStore(
    rightSidebarStore.subscribe,
    rightSidebarStore.isCollapsed,
  )
  const isRightSidebarCollapsedRef = useRef(isRightSidebarCollapsed)
  useEffect(() => {
    isRightSidebarCollapsedRef.current = isRightSidebarCollapsed
  }, [isRightSidebarCollapsed])

  // 项目仓库工作区列表（/gitWorktree 二级面板与 @ 搜索上下文共用）。
  const { worktrees, projectBranch, reload: reloadWorktrees } = useGitWorktrees(projectPath)

  const [previewMode, setPreviewMode] = useState<MarkdownPreviewMode>("edit")
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const historyCompartmentRef = useRef<Compartment | null>(null)
  if (!historyCompartmentRef.current) {
    historyCompartmentRef.current = new Compartment()
  }
  const historyCompartment = historyCompartmentRef.current
  const previewModeRef = useRef(previewMode)
  useEffect(() => {
    previewModeRef.current = previewMode
  }, [previewMode])

  const paste = useMarkdownPasteReference({
    editorViewRef,
    editorContainerRef,
  })

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

  const panels = useMarkdownPanels({
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

  const referencedRootsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    referencedRootsRef.current = new Set(referencedProjectPaths ?? [])
  }, [referencedProjectPaths])

  const page = useMarkdownPages({
    itemId,
    pageMode,
    pages,
    initialContent,
    onChange,
    onPagesChange,
    editorViewRef,
    historyCompartment,
    scrollToBottom: () => actions.scrollToBottom(),
    warning,
  })

  const currentVariables = useMemo(() => parseMarkdownVariables(page.content), [page.content])

  const previewHtml = useMemo(
    () =>
      markdownRenderer.render(page.content, {
        referencedRoots: new Set(referencedProjectPaths ?? []),
      }),
    [page.content, referencedProjectPaths],
  )

  const { captureScrollAnchor } = useEditorScrollSync({
    editorViewRef,
    previewRef,
    previewMode,
    previewHtml,
  })

  const actions = useMarkdownEditorActions({
    editorViewRef,
    previewRef,
    captureScrollAnchor,
    projectPath,
    worktreePath,
    onWorktreePathChange,
    worktrees,
    projectBranch,
    success,
    warning,
    error,
    t,
  })

  const changePreviewMode = (mode: MarkdownPreviewMode): void => {
    captureScrollAnchor()
    setPreviewMode(mode)
  }

  // 右侧栏展开时强制退出双栏模式，避免窄宽度下分屏不可用。
  useEffect(() => {
    if (isRightSidebarCollapsed || previewModeRef.current !== "split") return
    changePreviewMode("edit")
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

      page.handlePageKeyNavigation(event)
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [page.handlePageKeyNavigation])

  const pageRef = useRef(page)
  pageRef.current = page
  const panelsRef = useRef(panels)
  panelsRef.current = panels

  useEffect(() => {
    const container = editorContainerRef.current
    if (!container) return

    const keymaps = createMarkdownEditorKeymaps({
      paste,
      panels,
      actions,
      formattedCustomSlashCommands,
      onSaveRef,
      showToastSuccessRef,
      t,
    })

    const state = EditorState.create({
      doc: page.content,
      selection: { anchor: page.content.length },
      extensions: [
        historyCompartment.of(history()),
        markdown({
          codeLanguages: languages,
          extensions: [GFM, { remove: ["SetextHeading"] }],
        }),
        syntaxHighlighting(markdownHighlightStyle),
        editorTheme,
        lineFlashField,
        markdownReferenceHover,
        markdownMarkerHighlight(
          showFolding,
          () => referencedRootsRef.current,
          {
            success: (msg) => showToastSuccessRef.current(msg),
            warning: (msg) => showToastWarningRef.current(msg),
          },
          (k) => tRef.current(k as Parameters<typeof t>[0]),
        ),
        ...(showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
        ...(showFolding
          ? [foldState, markdownHeadingFolding, markdownFoldGutter, keymap.of(foldKeymap)]
          : []),
        EditorView.lineWrapping,
        indentUnit.of("  "),
        indentOnInput(),
        bracketMatching(),
        ...keymaps,
        EditorView.updateListener.of((update) => {
          paste.syncPasteReferenceOnUpdate(update)
          if (update.docChanged || update.selectionSet || update.viewportChanged) {
            panelsRef.current.syncBlockCommandPanel(update.view)
            panelsRef.current.syncSlashCommandPanel(update.view)
          }
          if (update.docChanged) {
            panelsRef.current.syncFileMentionPanel(update.view)
            panelsRef.current.syncTemplateFilePanel(update.view)
            panelsRef.current.syncVariablePanel(update.view)
            panelsRef.current.syncColonPanel(update.view)
          }
          if (update.selectionSet && !update.docChanged) {
            panelsRef.current.closeFileMentionPanel()
            panelsRef.current.closeTemplateFilePanel()
            panelsRef.current.closeVariablePanel()
            panelsRef.current.closeColonPanel()
          }
          if (update.docChanged) {
            const nextContent = update.state.doc.toString()
            pageRef.current.handleDocContentChange(nextContent)
          }
          const nextCanUndo = undoDepth(update.state) > 0
          const nextCanRedo = redoDepth(update.state) > 0
          setCanUndo((prev) => (prev !== nextCanUndo ? nextCanUndo : prev))
          setCanRedo((prev) => (prev !== nextCanRedo ? nextCanRedo : prev))
        }),
      ],
    })
    const view = new EditorView({ state, parent: container })
    editorViewRef.current = view

    actions.scrollToBottom()

    return () => {
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

  const toolbarActions: MarkdownToolbarAction[] = [
    {
      icon: Undo2,
      label: t("common.undo"),
      disabled: !canUndo,
      onClick: () => {
        const view = editorViewRef.current
        if (!view) return
        undo(view)
        view.focus()
      },
    },
    {
      icon: Redo2,
      label: t("common.redo"),
      disabled: !canRedo,
      onClick: () => {
        const view = editorViewRef.current
        if (!view) return
        redo(view)
        view.focus()
      },
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
        actions={toolbarActions}
        isSaved={isSaved}
        onInsertTable={(size) => actions.insertText(createMarkdownTable(size))}
        pageMode={pageMode}
        pages={pages}
        activePageIndex={page.activePageIndex}
        pageName={page.pageName}
        variables={currentVariables}
        onInsertVariable={(variable) => actions.insertText(variable.value)}
        onPageChange={page.switchPage}
        onPageNameChange={page.renamePage}
        onCreatePage={page.createPage}
        onDeletePage={page.deletePage}
        onPageReorder={page.reorderPage}
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
            onTemplateStatusToggle={actions.cycleTemplateStatus}
          />
        )}
      </div>
      <MarkdownStatusBar projectPath={worktreePath ?? projectPath} />
      <MarkdownCommandPanels paste={paste} panels={panels} t={t} />
    </section>
  )
}
