import type { EditorView } from "@codemirror/view"
import type { RefObject } from "react"
import { useRef, useState } from "react"
import type { TemplatePresetOption } from "@/features/markdown/commands/markdownSlashCommands"
import {
  getMarkdownSlashCommandLine,
  getTemplatePresetInitialSelectionRange,
  MARKDOWN_TEMPLATE_PRESET_OPTIONS,
} from "@/features/markdown/commands/markdownSlashCommands"
import type { TemplatePresetPanelState } from "@/features/markdown/hooks/useMarkdownPanels.types"
import { getMarkdownPanelPosition } from "@/features/markdown/utils/markdownPanelPosition"

/**
 * 模板预设选择面板：二级面板的状态、打开、内容替换与键盘导航。
 */
export const useMarkdownTemplatePresetPanel = ({
  editorViewRef,
}: {
  editorViewRef: RefObject<EditorView | null>
}) => {
  const templatePresetPanelRef = useRef<TemplatePresetPanelState | null>(null)
  const activeTemplatePresetIndexRef = useRef(0)
  const [templatePresetPanel, setTemplatePresetPanel] = useState<TemplatePresetPanelState | null>(
    null,
  )
  const [activeTemplatePresetIndex, setActiveTemplatePresetIndex] = useState(0)

  /**
   * 关闭模板预设选择面板。
   */
  const closeTemplatePresetPanel = (): void => {
    templatePresetPanelRef.current = null
    activeTemplatePresetIndexRef.current = 0
    setTemplatePresetPanel(null)
    setActiveTemplatePresetIndex(0)
  }

  /**
   * 打开模板预设选择面板：以当前光标处命令行为锚，列出预设选项。
   */
  const openTemplatePresetPanel = (view: EditorView): void => {
    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    const commandLine = getMarkdownSlashCommandLine(line.text, line.from, line.to)
    const coords = view.coordsAtPos(cursor)
    if (!coords) return

    const panel: TemplatePresetPanelState = {
      options: MARKDOWN_TEMPLATE_PRESET_OPTIONS,
      line: commandLine ?? { from: line.from, to: line.to, value: line.text },
      position: getMarkdownPanelPosition("file", coords),
    }
    templatePresetPanelRef.current = panel
    activeTemplatePresetIndexRef.current = 0
    setTemplatePresetPanel(panel)
    setActiveTemplatePresetIndex(0)
  }

  /**
   * 选中模板预设选项：将当前行替换为预设内容（严格顶格移除所有行首缩进）。
   */
  const selectTemplatePreset = (option: TemplatePresetOption): void => {
    const view = editorViewRef.current
    const panel = templatePresetPanelRef.current
    if (!view || !panel) return

    const initialSelection = getTemplatePresetInitialSelectionRange(option.content)
    const selection = initialSelection
      ? {
          anchor: panel.line.from + initialSelection.start,
          head: panel.line.from + initialSelection.end,
        }
      : { anchor: panel.line.from + option.content.length }

    view.dispatch({
      changes: { from: panel.line.from, to: panel.line.to, insert: option.content },
      selection,
    })
    view.focus()
    closeTemplatePresetPanel()
  }

  /**
   * 更新模板预设选择面板的当前选项。
   */
  const handleTemplatePresetKey = (offset: number): boolean => {
    const panel = templatePresetPanelRef.current
    if (!panel) return false

    const nextIndex =
      (activeTemplatePresetIndexRef.current + offset + panel.options.length) % panel.options.length
    activeTemplatePresetIndexRef.current = nextIndex
    setActiveTemplatePresetIndex(nextIndex)
    return true
  }

  return {
    templatePresetPanel,
    activeTemplatePresetIndex,
    templatePresetPanelRef,
    activeTemplatePresetIndexRef,
    closeTemplatePresetPanel,
    openTemplatePresetPanel,
    selectTemplatePreset,
    handleTemplatePresetKey,
  }
}
