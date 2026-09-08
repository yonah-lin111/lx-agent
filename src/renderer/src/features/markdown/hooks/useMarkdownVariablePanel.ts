import type { EditorView } from "@codemirror/view"
import type React from "react"
import { type CSSProperties, useRef, useState } from "react"
import {
  filterMarkdownVariables,
  getMarkdownVariableTrigger,
  type MarkdownVariableEntry,
  parseMarkdownVariables,
} from "@/features/markdown/commands/markdownVariableCommands"
import { getMarkdownPanelPosition } from "@/features/markdown/utils/markdownPanelPosition"

// 页面预设变量面板状态。
export interface MarkdownVariablePanelState {
  variables: MarkdownVariableEntry[]
  position: CSSProperties
  start: number
  triggerChar: "$" | "¥"
}

// 页面预设变量 Hook 配置选项。
export interface UseMarkdownVariablePanelOptions {
  editorViewRef: React.RefObject<EditorView | null>
}

// 页面预设变量 Hook 返回结果。
export interface UseMarkdownVariablePanelResult {
  variablePanel: MarkdownVariablePanelState | null
  activeVariableIndex: number
  variablePanelRef: React.MutableRefObject<MarkdownVariablePanelState | null>
  activeVariableIndexRef: React.MutableRefObject<number>
  closeVariablePanel: () => void
  syncVariablePanel: (view: EditorView) => void
  selectVariable: (variable: MarkdownVariableEntry) => void
  handleVariableKey: (offset: number) => boolean
}

/**
 * 管理 Markdown 页面预设变量（$ / ¥ 触发）浮动命令面板的状态同步与键盘交互。
 */
export const useMarkdownVariablePanel = ({
  editorViewRef,
}: UseMarkdownVariablePanelOptions): UseMarkdownVariablePanelResult => {
  const variablePanelRef = useRef<MarkdownVariablePanelState | null>(null)
  const activeVariableIndexRef = useRef(0)
  const [variablePanel, setVariablePanel] = useState<MarkdownVariablePanelState | null>(null)
  const [activeVariableIndex, setActiveVariableIndex] = useState(0)

  const closeVariablePanel = (): void => {
    variablePanelRef.current = null
    activeVariableIndexRef.current = 0
    setVariablePanel(null)
    setActiveVariableIndex(0)
  }

  const syncVariablePanel = (view: EditorView): void => {
    const cursor = view.state.selection.main.head
    const docText = view.state.doc.toString()
    const prefix = view.state.doc.sliceString(0, cursor)

    const trigger = getMarkdownVariableTrigger(prefix, docText)
    if (!trigger) {
      closeVariablePanel()
      return
    }

    const variables = parseMarkdownVariables(docText)
    if (variables.length === 0) {
      closeVariablePanel()
      return
    }

    const matched = filterMarkdownVariables(variables, trigger.fragment)
    if (matched.length === 0) {
      closeVariablePanel()
      return
    }

    const coords = view.coordsAtPos(cursor)
    if (!coords) {
      closeVariablePanel()
      return
    }

    const position = getMarkdownPanelPosition("file", coords)
    const panel: MarkdownVariablePanelState = {
      variables: matched,
      position,
      start: trigger.start,
      triggerChar: trigger.triggerChar,
    }

    const previous = variablePanelRef.current
    if (
      previous?.triggerChar !== trigger.triggerChar ||
      previous.variables.length !== matched.length ||
      previous.variables[0]?.name !== matched[0]?.name
    ) {
      activeVariableIndexRef.current = 0
      setActiveVariableIndex(0)
    }

    variablePanelRef.current = panel
    setVariablePanel(panel)
  }

  const selectVariable = (variable: MarkdownVariableEntry): void => {
    const view = editorViewRef.current
    const panel = variablePanelRef.current
    if (!view || !panel) return

    const cursor = view.state.selection.main.head
    const insertion = variable.value
    view.dispatch({
      changes: { from: panel.start, to: cursor, insert: insertion },
      selection: { anchor: panel.start + insertion.length },
    })
    view.focus()
    closeVariablePanel()
  }

  const handleVariableKey = (offset: number): boolean => {
    const panel = variablePanelRef.current
    if (!panel || panel.variables.length === 0) return false

    const nextIndex =
      (activeVariableIndexRef.current + offset + panel.variables.length) % panel.variables.length
    activeVariableIndexRef.current = nextIndex
    setActiveVariableIndex(nextIndex)
    return true
  }

  return {
    variablePanel,
    activeVariableIndex,
    variablePanelRef,
    activeVariableIndexRef,
    closeVariablePanel,
    syncVariablePanel,
    selectVariable,
    handleVariableKey,
  }
}
