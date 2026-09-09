import type { EditorView } from "@codemirror/view"
import type React from "react"
import { type CSSProperties, useCallback, useRef, useState } from "react"
import {
  getMarkdownColonTrigger,
  isInsideMarkdownVariableBlock,
} from "@/features/markdown/commands/markdownVariableCommands"
import { getMarkdownPanelPosition } from "@/features/markdown/utils/markdownPanelPosition"

export type MarkdownColonOptionType = "single" | "multi" | "nestedSingle" | "nestedMulti"

export interface MarkdownColonPanelState {
  active: boolean
  key: string
  indent: string
  from: number
  to: number
  position: CSSProperties
}

export interface UseMarkdownColonPanelReturn {
  colonPanelState: MarkdownColonPanelState
  colonPanelRef: React.RefObject<MarkdownColonPanelState | null>
  activeColonOptionIndex: number
  activeColonOptionIndexRef: React.RefObject<number>
  syncColonPanel: (view: EditorView) => void
  closeColonPanel: () => void
  handleColonKey: (key: string) => boolean
  selectColonOption: (forcedType?: MarkdownColonOptionType) => boolean
}

const COLON_OPTION_TYPES: MarkdownColonOptionType[] = [
  "single",
  "multi",
  "nestedSingle",
  "nestedMulti",
]

export const useMarkdownColonPanel = (
  editorRef: React.RefObject<EditorView | null>,
): UseMarkdownColonPanelReturn => {
  const [colonPanelState, setColonPanelState] = useState<MarkdownColonPanelState>({
    active: false,
    key: "",
    indent: "",
    from: 0,
    to: 0,
    position: {},
  })
  const colonPanelRef = useRef<MarkdownColonPanelState | null>(null)
  const [activeColonOptionIndex, setActiveColonOptionIndex] = useState(0)
  const activeColonOptionIndexRef = useRef(0)

  const closeColonPanel = useCallback((): void => {
    colonPanelRef.current = null
    activeColonOptionIndexRef.current = 0
    setActiveColonOptionIndex(0)
    setColonPanelState((prev) => (prev.active ? { ...prev, active: false } : prev))
  }, [])

  const selectColonOption = useCallback(
    (forcedType?: MarkdownColonOptionType): boolean => {
      const editor = editorRef.current
      const state = colonPanelRef.current
      if (!editor || !state || !state.active) return false

      const optionType =
        forcedType ?? COLON_OPTION_TYPES[activeColonOptionIndexRef.current] ?? "single"
      const { indent, key, from, to } = state

      if (optionType === "single") {
        const prefix = `${indent}${key}: "`
        const replacement = `${prefix}var"`
        const varStart = from + prefix.length
        const varEnd = varStart + 3
        editor.dispatch({
          changes: { from, to, insert: replacement },
          selection: { anchor: varStart, head: varEnd },
        })
      } else if (optionType === "multi") {
        const prefix = `${indent}${key}:\n${indent}  """\n${indent}  `
        const replacement = `${prefix}var\n${indent}  """`
        const varStart = from + prefix.length
        const varEnd = varStart + 3
        editor.dispatch({
          changes: { from, to, insert: replacement },
          selection: { anchor: varStart, head: varEnd },
        })
      } else if (optionType === "nestedSingle") {
        const prefix = `${indent}${key}:\n${indent}  `
        const replacement = `${prefix}key: "var"`
        const keyStart = from + prefix.length
        const keyEnd = keyStart + 3
        editor.dispatch({
          changes: { from, to, insert: replacement },
          selection: { anchor: keyStart, head: keyEnd },
        })
      } else if (optionType === "nestedMulti") {
        const prefix = `${indent}${key}:\n${indent}  `
        const replacement = `${prefix}key:\n${indent}    """\n${indent}    var\n${indent}    """`
        const keyStart = from + prefix.length
        const keyEnd = keyStart + 3
        editor.dispatch({
          changes: { from, to, insert: replacement },
          selection: { anchor: keyStart, head: keyEnd },
        })
      }

      closeColonPanel()
      return true
    },
    [editorRef, closeColonPanel],
  )

  const handleColonKey = useCallback(
    (key: string): boolean => {
      const state = colonPanelRef.current
      if (!state || !state.active) return false

      if (key === "ArrowDown") {
        const next = (activeColonOptionIndexRef.current + 1) % COLON_OPTION_TYPES.length
        activeColonOptionIndexRef.current = next
        setActiveColonOptionIndex(next)
        return true
      }
      if (key === "ArrowUp") {
        const next =
          (activeColonOptionIndexRef.current - 1 + COLON_OPTION_TYPES.length) %
          COLON_OPTION_TYPES.length
        activeColonOptionIndexRef.current = next
        setActiveColonOptionIndex(next)
        return true
      }
      if (key === "Enter" || key === "Tab") {
        return selectColonOption()
      }
      if (key === "Escape") {
        closeColonPanel()
        return true
      }

      return false
    },
    [selectColonOption, closeColonPanel],
  )

  const syncColonPanel = useCallback(
    (view: EditorView): void => {
      const cursor = view.state.selection.main.head
      const docText = view.state.doc.toString()

      if (!isInsideMarkdownVariableBlock(docText, cursor)) {
        if (colonPanelRef.current?.active) closeColonPanel()
        return
      }

      const line = view.state.doc.lineAt(cursor)
      const trigger = getMarkdownColonTrigger(line.text, cursor - line.from, line.from)

      if (!trigger) {
        if (colonPanelRef.current?.active) closeColonPanel()
        return
      }

      const coords = view.coordsAtPos(cursor)
      if (!coords) {
        if (colonPanelRef.current?.active) closeColonPanel()
        return
      }

      const panel: MarkdownColonPanelState = {
        active: true,
        key: trigger.key,
        indent: trigger.indent,
        from: trigger.from,
        to: trigger.to,
        position: getMarkdownPanelPosition("slash", coords),
      }

      colonPanelRef.current = panel
      activeColonOptionIndexRef.current = 0
      setActiveColonOptionIndex(0)
      setColonPanelState(panel)
    },
    [closeColonPanel],
  )

  return {
    colonPanelState,
    colonPanelRef,
    activeColonOptionIndex,
    activeColonOptionIndexRef,
    syncColonPanel,
    closeColonPanel,
    handleColonKey,
    selectColonOption,
  }
}
