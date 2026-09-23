import type { EditorView } from "@codemirror/view"
import type { Locale } from "@shared/settings"
import type { CSSProperties, RefObject } from "react"
import { useRef, useState } from "react"
import type {
  MarkdownBlockCommand,
  MarkdownBlockTrigger,
} from "@/components/ui/LxMarkdown/commands/markdownBlockCommands"
import {
  createMarkdownBlockInsertion,
  getMarkdownBlockCommands,
  getMarkdownBlockTrigger,
  isInsideMarkdownCodeFence,
} from "@/components/ui/LxMarkdown/commands/markdownBlockCommands"
import { getMarkdownPanelPosition } from "@/components/ui/LxMarkdown/utils/markdownPanelPosition"

// Markdown 块命令面板状态。
export interface MarkdownBlockCommandPanelState {
  commands: MarkdownBlockCommand[]
  position: CSSProperties
  trigger: MarkdownBlockTrigger
}

/**
 * Markdown 块命令面板：触发标记同步、模板替换与键盘导航。
 */
export const useMarkdownBlockCommandPanel = ({
  editorViewRef,
  context,
}: {
  editorViewRef: RefObject<EditorView | null>
  // 语言环境 ref：面板文案在回调执行时读取最新值。
  context: { localeRef: RefObject<Locale> }
}) => {
  const { localeRef } = context
  const blockCommandPanelRef = useRef<MarkdownBlockCommandPanelState | null>(null)
  const activeBlockCommandIndexRef = useRef(0)
  const [blockCommandPanel, setBlockCommandPanel] = useState<MarkdownBlockCommandPanelState | null>(
    null,
  )
  const [activeBlockCommandIndex, setActiveBlockCommandIndex] = useState(0)

  /**
   * 更新 Markdown 块命令面板的候选项及其相对光标的位置。
   */
  const syncBlockCommandPanel = (view: EditorView): void => {
    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    const trigger = getMarkdownBlockTrigger(line.text, line.from, cursor)
    const measurePos = trigger?.kind === "codeBlock" && cursor > line.from ? cursor - 1 : cursor
    const coords = view.coordsAtPos(measurePos)
    const isClosingCodeFence =
      trigger?.kind === "codeBlock" &&
      isInsideMarkdownCodeFence(view.state.doc.sliceString(0, line.from))

    let isContinuousList = false
    if (trigger) {
      if (line.number > 1) {
        const prevLine = view.state.doc.line(line.number - 1)
        const prevText = prevLine.text
        if (trigger.kind === "unorderedList") {
          if (/^(\s*)[-+*](\s|$)/.test(prevText)) {
            isContinuousList = true
          }
        } else if (trigger.kind === "orderedList") {
          if (/^(\s*)\d+[.)](\s|$)/.test(prevText)) {
            isContinuousList = true
          }
        } else if (trigger.kind === "quote") {
          if (/^(\s*)>(\s|$)/.test(prevText)) {
            isContinuousList = true
          }
        } else if (trigger.kind === "table") {
          if (/^(\s*)\|/.test(prevText)) {
            isContinuousList = true
          }
        }
      }
    }

    const commands =
      trigger && !isClosingCodeFence && !isContinuousList
        ? getMarkdownBlockCommands(trigger.kind, localeRef.current)
        : []

    if (!trigger || !coords || commands.length === 0) {
      blockCommandPanelRef.current = null
      activeBlockCommandIndexRef.current = 0
      setBlockCommandPanel(null)
      setActiveBlockCommandIndex(0)
      return
    }

    const coordsLeft =
      trigger?.kind === "codeBlock" && cursor > line.from ? coords.right : coords.left
    const panel = {
      commands,
      trigger,
      position: getMarkdownPanelPosition("block", coords, coordsLeft),
    }
    const previous = blockCommandPanelRef.current
    if (previous?.trigger.kind !== trigger.kind || previous.trigger.to !== trigger.to) {
      activeBlockCommandIndexRef.current = 0
      setActiveBlockCommandIndex(0)
    }
    blockCommandPanelRef.current = panel
    setBlockCommandPanel(panel)
  }

  /**
   * 将当前触发标记替换为用户选择的 Markdown 块模板。
   */
  const selectBlockCommand = (command: MarkdownBlockCommand): void => {
    const view = editorViewRef.current
    if (!view) return

    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    const trigger = getMarkdownBlockTrigger(line.text, line.from, cursor)
    if (!trigger) return

    let insertion = createMarkdownBlockInsertion(command.id)

    if (command.id === "codeBlock" && line.number < view.state.doc.lines) {
      const fenceChar = line.text.trim()[0] || "`"
      const fenceLength = line.text.trim().length
      const fenceString = fenceChar.repeat(fenceLength)
      let hasClosingFence = false

      for (let i = line.number + 1; i <= view.state.doc.lines; i++) {
        const currLineText = view.state.doc.line(i).text.trim()
        if (currLineText.startsWith(fenceString)) {
          if (currLineText === fenceString) {
            hasClosingFence = true
          }
          break
        }
      }

      if (hasClosingFence) {
        insertion = {
          text: `${fenceString}language`,
          selectionStart: fenceLength,
          selectionEnd: fenceLength + 8,
        }
      }
    }

    view.dispatch({
      changes: { from: trigger.from, to: trigger.to, insert: insertion.text },
      selection: {
        anchor: trigger.from + insertion.selectionStart,
        head: trigger.from + insertion.selectionEnd,
      },
    })
    view.focus()
  }

  /**
   * 切换菜单高亮项，并保持键盘选择状态与视图一致。
   */
  const setActiveBlockCommand = (index: number): void => {
    activeBlockCommandIndexRef.current = index
    setActiveBlockCommandIndex(index)
  }

  /**
   * 处理 Markdown 块命令菜单的键盘选择。
   */
  const handleBlockCommandKey = (offset: number): boolean => {
    const panel = blockCommandPanelRef.current
    if (!panel) return false

    const nextIndex =
      (activeBlockCommandIndexRef.current + offset + panel.commands.length) % panel.commands.length
    setActiveBlockCommand(nextIndex)
    return true
  }

  return {
    blockCommandPanel,
    activeBlockCommandIndex,
    blockCommandPanelRef,
    activeBlockCommandIndexRef,
    syncBlockCommandPanel,
    selectBlockCommand,
    handleBlockCommandKey,
    setBlockCommandPanel,
  }
}
