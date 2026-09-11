import type { EditorView, ViewUpdate } from "@codemirror/view"
import { useEffect, useRef, useState } from "react"
import { createMarkdownReference } from "@/features/markdown/commands/markdownReferenceCommands"
import { getClipboardFilesAsync } from "@/lib/clipboard"

export interface PasteReferencePanelState {
  from: number
  to: number
  insertion: string
  referenceInsertion: string
  originalText: string
  paths: { path: string; type: "folder" | "file" | "image" }[]
  position: { left: number; top: number | string; bottom: number | string }
}

export interface UseMarkdownPasteReferenceOptions {
  editorViewRef: React.RefObject<EditorView | null>
  editorContainerRef: React.RefObject<HTMLDivElement | null>
}

export interface UseMarkdownPasteReferenceResult {
  pasteReferencePanel: PasteReferencePanelState | null
  activePasteReferenceIndex: number
  pasteReferencePanelRef: React.MutableRefObject<PasteReferencePanelState | null>
  activePasteReferenceIndexRef: React.MutableRefObject<number>
  closePasteReferencePanel: (restore?: boolean) => void
  handlePasteReferenceKey: (offset: number) => boolean
  selectPasteReference: (mode: "reference" | "path") => boolean
  handleClipboardPaste: (event: ClipboardEvent, view: EditorView) => boolean
  syncPasteReferenceOnUpdate: (update: ViewUpdate) => void
}

/**
 * 管理剪贴板文件/路径粘贴的智能引用转换弹层状态与交互。
 */
export const useMarkdownPasteReference = ({
  editorViewRef,
  editorContainerRef,
}: UseMarkdownPasteReferenceOptions): UseMarkdownPasteReferenceResult => {
  const [pasteReferencePanel, setPasteReferencePanel] = useState<PasteReferencePanelState | null>(
    null,
  )
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
      const target = event.target as HTMLElement | null
      if (editorContainerRef.current?.contains(target)) return
      // 命令面板内的点选不视为外部点击，避免选择动作执行前面板被提前关闭。
      if (target?.closest?.(".markdown-command-menu")) return
      closePasteReferencePanel()
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [editorContainerRef])

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

  const handleClipboardPaste = (event: ClipboardEvent, view: EditorView): boolean => {
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
        .map(({ path, type }) => createMarkdownReference(type, path))
        .join(" ")} `
      const insertion = `${leadingSpace}${files.map(({ path }) => path).join(" ")} `
      const coords = view.coordsAtPos(from)
      if (!coords) return

      const panel: PasteReferencePanelState = {
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
  }

  const syncPasteReferenceOnUpdate = (update: ViewUpdate): void => {
    if (pasteReferencePanelRef.current) {
      const panel = pasteReferencePanelRef.current
      const currentDoc = update.state.doc.toString()
      const insertedText = currentDoc.slice(panel.from, panel.from + panel.insertion.length)
      const cursor = update.state.selection.main.head
      const isCursorInRange = cursor >= panel.from && cursor <= panel.from + panel.insertion.length
      if (insertedText !== panel.insertion || !isCursorInRange) {
        pasteReferencePanelRef.current = null
        activePasteReferenceIndexRef.current = 0
        setPasteReferencePanel(null)
        setActivePasteReferenceIndex(0)
      }
    }
  }

  return {
    pasteReferencePanel,
    activePasteReferenceIndex,
    pasteReferencePanelRef,
    activePasteReferenceIndexRef,
    closePasteReferencePanel,
    handlePasteReferenceKey,
    selectPasteReference,
    handleClipboardPaste,
    syncPasteReferenceOnUpdate,
  }
}
