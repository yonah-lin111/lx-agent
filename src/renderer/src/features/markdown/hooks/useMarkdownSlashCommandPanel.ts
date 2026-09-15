import type { EditorView } from "@codemirror/view"
import type { RefObject } from "react"
import { useRef, useState } from "react"
import {
  createMarkdownTemplateId,
  isInsideMarkdownTemplateBlock,
} from "@/features/markdown/commands/markdownBlockCommands"
import type { MarkdownSlashCommand } from "@/features/markdown/commands/markdownSlashCommands"
import {
  getMarkdownSlashCommandLine,
  getMarkdownSlashCommands,
  getTemplatePlaceholderSelectionRange,
  isMarkdownConfirmCommandArmed,
} from "@/features/markdown/commands/markdownSlashCommands"
import {
  applyMarkdownTemplatePreset,
  isInsideMarkdownVariableBlock,
  isInsideMarkdownVarMultilineString,
} from "@/features/markdown/commands/markdownVariableCommands"
import type {
  GitWorktreePanelState,
  MarkdownPanelsContextRefs,
  MarkdownSendPromptFlagPanelState,
  MarkdownSendPromptPanelState,
  MarkdownSlashCommandPanelState,
  TemplatePresetPanelState,
} from "@/features/markdown/hooks/useMarkdownPanels.types"
import { getMarkdownPanelPosition } from "@/features/markdown/utils/markdownPanelPosition"

/**
 * Markdown 斜杠命令面板：命令匹配、一级选择与二级面板的打开/收起联动。
 */
export const useMarkdownSlashCommandPanel = ({
  editorViewRef,
  context,
  gitWorktreePanelRef,
  templatePresetPanelRef,
  sendPromptPanelRef,
  sendPromptFlagPanelRef,
  closeGitWorktreePanel,
  closeTemplatePresetPanel,
  closeSendPromptPanel,
  closeSendPromptFlagPanel,
  openGitWorktreePanel,
  openTemplatePresetPanel,
  openSendPromptPanel,
  openSendPromptFlagPanel,
}: {
  editorViewRef: RefObject<EditorView | null>
  context: Pick<
    MarkdownPanelsContextRefs,
    "customSlashCommandsRef" | "localeRef" | "projectPathRef" | "worktreesRef"
  >
  // 二级面板引用：命令行内容变化时收起已打开的面板。
  gitWorktreePanelRef: RefObject<GitWorktreePanelState | null>
  templatePresetPanelRef: RefObject<TemplatePresetPanelState | null>
  sendPromptPanelRef: RefObject<MarkdownSendPromptPanelState | null>
  sendPromptFlagPanelRef: RefObject<MarkdownSendPromptFlagPanelState | null>
  closeGitWorktreePanel: () => void
  closeTemplatePresetPanel: () => void
  closeSendPromptPanel: () => void
  closeSendPromptFlagPanel: () => void
  openGitWorktreePanel: (view: EditorView) => void
  openTemplatePresetPanel: (view: EditorView) => void
  openSendPromptPanel: (view: EditorView) => void
  openSendPromptFlagPanel: (view: EditorView, target: string, flagQuery?: string) => void
}) => {
  const { customSlashCommandsRef, localeRef, projectPathRef, worktreesRef } = context
  const slashCommandPanelRef = useRef<MarkdownSlashCommandPanelState | null>(null)
  const activeSlashCommandIndexRef = useRef(0)
  const [slashCommandPanel, setSlashCommandPanel] = useState<MarkdownSlashCommandPanelState | null>(
    null,
  )
  const [activeSlashCommandIndex, setActiveSlashCommandIndex] = useState(0)

  /**
   * 关闭 Markdown 斜杠命令面板。
   */
  const closeSlashCommandPanel = (): void => {
    slashCommandPanelRef.current = null
    activeSlashCommandIndexRef.current = 0
    setSlashCommandPanel(null)
    setActiveSlashCommandIndex(0)
  }

  /**
   * 同步 Markdown 光标处的模板命令面板。
   * 模板命令（/addTemplate 等）仅在模板块外可用；AI 总结命令（/summaryTitle）仅在模板块内可用。
   */
  const syncSlashCommandPanel = (view: EditorView): void => {
    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    const commandLine = getMarkdownSlashCommandLine(line.text, line.from, line.to)
    const gitWorktreePanel = gitWorktreePanelRef.current
    if (
      gitWorktreePanel &&
      (commandLine?.from !== gitWorktreePanel.line.from ||
        commandLine?.value !== gitWorktreePanel.line.value)
    ) {
      closeGitWorktreePanel()
    }
    const templatePresetPanel = templatePresetPanelRef.current
    if (
      templatePresetPanel &&
      (commandLine?.from !== templatePresetPanel.line.from ||
        commandLine?.value !== templatePresetPanel.line.value)
    ) {
      closeTemplatePresetPanel()
    }
    const sendPromptPanel = sendPromptPanelRef.current
    if (
      sendPromptPanel &&
      (commandLine?.from !== sendPromptPanel.line.from ||
        commandLine?.value !== sendPromptPanel.line.value)
    ) {
      closeSendPromptPanel()
    }
    const sendPromptFlagPanel = sendPromptFlagPanelRef.current
    if (
      sendPromptFlagPanel &&
      (commandLine?.from !== sendPromptFlagPanel.line.from ||
        commandLine?.value !== sendPromptFlagPanel.line.value)
    ) {
      closeSendPromptFlagPanel()
    }
    const isInsideTemplateBlock = isInsideMarkdownTemplateBlock(
      view.state.doc.sliceString(0, line.from),
    )
    const isInsideVarBlock = isInsideMarkdownVariableBlock(view.state.doc.toString(), cursor)
    const isInsideVarMultiline =
      isInsideVarBlock && isInsideMarkdownVarMultilineString(view.state.doc.toString(), cursor)

    // 检查是否处于 3 级标志位输入态（如 /sendPrompt opencode - 或 /sendPrompt opencode:my-dev -n）
    const flagMatch = /^\/sendPrompt\s+([^\s]+)\s+(-[a-zA-Z0-9_-]*)$/i.exec(
      commandLine?.value ?? "",
    )
    if (flagMatch && isInsideTemplateBlock && !isInsideVarBlock) {
      closeSlashCommandPanel()
      closeSendPromptPanel()
      openSendPromptFlagPanel(view, flagMatch[1], flagMatch[2])
      return
    } else if (sendPromptFlagPanelRef.current) {
      closeSendPromptFlagPanel()
    }

    // 已武装的确认命令行不弹面板，等待二次回车触发。
    const isArmed =
      commandLine && (!isInsideVarBlock || isInsideVarMultiline)
        ? isMarkdownConfirmCommandArmed(
            commandLine.value,
            isInsideTemplateBlock,
            customSlashCommandsRef.current,
            isInsideVarBlock,
          )
        : false
    const commands = commandLine
      ? getMarkdownSlashCommands(
          commandLine.value,
          isInsideTemplateBlock,
          Boolean(projectPathRef.current) && worktreesRef.current !== null,
          customSlashCommandsRef.current,
          localeRef.current,
          isInsideVarBlock && !isInsideVarMultiline,
        )
      : []
    const coords = view.coordsAtPos(cursor)

    if (!commandLine || isArmed || !coords || commands.length === 0) {
      closeSlashCommandPanel()
      return
    }

    const panel = {
      commands,
      line: commandLine,
      position: getMarkdownPanelPosition("slash", coords),
    }
    const previous = slashCommandPanelRef.current
    if (previous?.line.value !== commandLine.value) {
      activeSlashCommandIndexRef.current = 0
      setActiveSlashCommandIndex(0)
    }
    slashCommandPanelRef.current = panel
    setSlashCommandPanel(panel)
  }

  /**
   * 用选中的模板替换当前斜杠命令行。
   */
  const selectSlashCommand = (command: MarkdownSlashCommand): void => {
    const view = editorViewRef.current
    const panel = slashCommandPanelRef.current
    if (!view || !panel) return

    if (command.id === "applyPreset") {
      const docText = view.state.doc.toString()
      const applied = applyMarkdownTemplatePreset(docText, panel.line.from)
      if (applied) {
        view.dispatch({
          changes: { from: applied.from, to: applied.to, insert: applied.insert },
          selection: { anchor: applied.cursor ?? panel.line.from },
        })
      } else {
        view.dispatch({
          changes: { from: panel.line.from, to: panel.line.to, insert: "" },
          selection: { anchor: panel.line.from },
        })
      }
      view.focus()
      closeSlashCommandPanel()
      return
    }

    // 二次回车命令：回显命令内容到编辑器（确认型命令的 content 带尾随空格），等待二次 Enter 触发。
    if (command.kind === "confirm") {
      view.dispatch({
        changes: { from: panel.line.from, to: panel.line.to, insert: command.content },
        selection: { anchor: panel.line.from + command.content.length },
      })
      view.focus()
      closeSlashCommandPanel()
      return
    }

    // 选择型命令（/gitWorktree、/sendPrompt、/templatePreset）：回显命令文本后打开二级工作区/目标/预设面板，选中后回车触发。
    if (command.kind === "select") {
      view.dispatch({
        changes: { from: panel.line.from, to: panel.line.to, insert: command.content },
        selection: { anchor: panel.line.from + command.content.length },
      })
      view.focus()
      closeSlashCommandPanel()
      if (command.id === "sendPrompt") {
        openSendPromptPanel(view)
      } else if (command.id === "templatePreset") {
        openTemplatePresetPanel(view)
      } else {
        openGitWorktreePanel(view)
      }
      return
    }

    // 自定义模板命令：直接将 content 插入光标行，若包含占位符则默认选中首个占位符。
    if (command.kind === "customTemplate") {
      const placeholderRange = getTemplatePlaceholderSelectionRange(command.content)
      const selection = placeholderRange
        ? {
            anchor: panel.line.from + placeholderRange.start,
            head: panel.line.from + placeholderRange.end,
          }
        : { anchor: panel.line.from + command.cursorOffset }

      view.dispatch({
        changes: { from: panel.line.from, to: panel.line.to, insert: command.content },
        selection,
      })
      view.focus()
      closeSlashCommandPanel()
      return
    }

    // 直接命令（scope=normal）插入时在结束行 &&& 标记后追加唯一 id；
    // suppleTemplate 插入时在结束行 +++ 标记后追加唯一 id；光标位置不受影响。
    let content = command.content
    if (command.scope === "normal") {
      content = content.replace(
        /(?:&&&(?:\s+[A-Za-z]\w*)?(?:\s+--end)?)$/m,
        (match) => `${match} {id:${createMarkdownTemplateId()}}`,
      )
    } else if (command.id === "suppleTemplate") {
      content = content.replace(
        /(?:\+\+\+\s+(?:suppleTemplate|supple)\s+--end)$/m,
        (match) => `${match} {id:${createMarkdownTemplateId()}}`,
      )
    }

    let selection = command.selectionRange
      ? {
          anchor: panel.line.from + command.selectionRange.start,
          head: panel.line.from + command.selectionRange.end,
        }
      : { anchor: panel.line.from + command.cursorOffset }

    if (command.scope === "varTemplate") {
      const lineText = view.state.doc.sliceString(panel.line.from, panel.line.to)
      const lineIndentMatch = lineText.match(/^([ \t]*)/)
      const indent = lineIndentMatch ? lineIndentMatch[1] : ""
      if (indent.length > 0) {
        content = content
          .split("\n")
          .map((l) => `${indent}${l}`)
          .join("\n")
        if (command.selectionRange) {
          selection = {
            anchor: panel.line.from + indent.length + command.selectionRange.start,
            head: panel.line.from + indent.length + command.selectionRange.end,
          }
        } else {
          selection = { anchor: panel.line.from + indent.length + command.cursorOffset }
        }
      }
    }

    view.dispatch({
      changes: { from: panel.line.from, to: panel.line.to, insert: content },
      selection,
    })
    view.focus()
    closeSlashCommandPanel()
  }

  /**
   * 更新模板命令面板的当前选项。
   */
  const handleSlashCommandKey = (offset: number): boolean => {
    const panel = slashCommandPanelRef.current
    if (!panel) return false

    const nextIndex =
      (activeSlashCommandIndexRef.current + offset + panel.commands.length) % panel.commands.length
    activeSlashCommandIndexRef.current = nextIndex
    setActiveSlashCommandIndex(nextIndex)
    return true
  }

  return {
    slashCommandPanel,
    activeSlashCommandIndex,
    slashCommandPanelRef,
    activeSlashCommandIndexRef,
    closeSlashCommandPanel,
    syncSlashCommandPanel,
    selectSlashCommand,
    handleSlashCommandKey,
  }
}
