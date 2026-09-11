import type { EditorView } from "@codemirror/view"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createMarkdownReference } from "@/features/markdown/commands/markdownReferenceCommands"
import {
  buildPasteReferenceOptions,
  type MarkdownPasteReferenceOption,
} from "@/features/markdown/components/MarkdownPasteCommandMenu"
import type { TranslationKey } from "@/i18n"
import { getClipboardFilesAsync } from "@/lib/clipboard"
import { getAgentPanelPosition } from "../../AgentInputCommandPanels"
import type { AgentInputFile } from "../../AgentInputFiles"
import type { AgentInputPastePanelState } from "../types"

interface UseAgentInputPasteProps {
  editorViewRef: React.RefObject<EditorView | null>
  getPanelAnchor: () => HTMLElement | null
  onAddFiles?: (files: AgentInputFile[]) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

export const useAgentInputPaste = ({
  editorViewRef,
  getPanelAnchor,
  onAddFiles,
  t,
}: UseAgentInputPasteProps) => {
  const [pastePanel, setPastePanel] = useState<AgentInputPastePanelState | null>(null)
  const [pasteIndex, setPasteIndex] = useState(0)

  const pastePanelRef = useRef(pastePanel)
  pastePanelRef.current = pastePanel
  const pasteIndexRef = useRef(pasteIndex)
  pasteIndexRef.current = pasteIndex
  const onAddFilesRef = useRef(onAddFiles)
  onAddFilesRef.current = onAddFiles

  const pasteOptions = useMemo<MarkdownPasteReferenceOption[]>(() => {
    if (!pastePanel) return []
    return buildPasteReferenceOptions(pastePanel.paths, t, true)
  }, [pastePanel, t])
  const pasteOptionsRef = useRef(pasteOptions)
  pasteOptionsRef.current = pasteOptions

  const closePastePanel = useCallback(
    (restore = true): void => {
      const view = editorViewRef.current
      const panel = pastePanelRef.current
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
      pastePanelRef.current = null
      pasteIndexRef.current = 0
      setPastePanel(null)
      setPasteIndex(0)
    },
    [editorViewRef],
  )

  const selectPasteReference = useCallback(
    (mode: "reference" | "path" | "upload"): boolean => {
      const view = editorViewRef.current
      const panel = pastePanelRef.current
      if (!view || !panel) return false

      if (mode === "upload") {
        const uploadablePaths = panel.paths.filter((p) => p.type !== "folder")
        if (uploadablePaths.length > 0 && onAddFilesRef.current) {
          const filesToAdd: AgentInputFile[] = uploadablePaths.map((item, index) => {
            const normalizedPath = item.path.replace(/[\\/]+$/, "")
            const name = normalizedPath.split(/[\\/]/).pop() || item.path
            const ext = name.split(".").pop()?.toLowerCase() || ""
            return {
              id: `f-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`,
              name,
              path: item.path,
              type: item.type === "image" ? "image" : "text",
              extension: ext.toUpperCase(),
            }
          })
          onAddFilesRef.current(filesToAdd)
        }
        closePastePanel(true)
        return true
      }

      const text = mode === "reference" ? panel.referenceInsertion : panel.insertion
      view.dispatch({
        changes: {
          from: panel.from,
          to: panel.from + panel.insertion.length,
          insert: text,
        },
        selection: { anchor: panel.from + text.length },
        userEvent: "input.paste",
      })
      view.focus()
      closePastePanel(false)
      return true
    },
    [closePastePanel, editorViewRef],
  )

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (!pastePanelRef.current) return
      const target = event.target as HTMLElement | null
      const anchor = getPanelAnchor()
      if (anchor?.contains(target)) return
      // 命令面板内的点选不视为外部点击，避免选择动作执行前面板被提前关闭。
      if (target?.closest?.(".markdown-command-menu")) return
      closePastePanel()
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [closePastePanel, getPanelAnchor])

  const handlePasteEvent = useCallback(
    (event: ClipboardEvent, view: EditorView): boolean => {
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
        const anchor = getPanelAnchor()
        const position = anchor
          ? getAgentPanelPosition("command", anchor.getBoundingClientRect())
          : { left: 8, top: 8 }

        const panel: AgentInputPastePanelState = {
          from,
          insertion,
          referenceInsertion,
          originalText: view.state.doc.sliceString(from, to),
          paths: files,
          position,
        }
        pastePanelRef.current = panel
        pasteIndexRef.current = 0
        setPastePanel(panel)
        setPasteIndex(0)
        view.dispatch({
          changes: { from, to, insert: insertion },
          selection: { anchor: from + insertion.length },
          userEvent: "input.paste",
        })
        view.focus()
      })
      return true
    },
    [getPanelAnchor],
  )

  return {
    pastePanel,
    setPastePanel,
    pastePanelRef,
    pasteIndex,
    setPasteIndex,
    pasteIndexRef,
    pasteOptions,
    pasteOptionsRef,
    closePastePanel,
    selectPasteReference,
    handlePasteEvent,
  }
}
