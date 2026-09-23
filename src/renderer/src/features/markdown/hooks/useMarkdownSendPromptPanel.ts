import type { EditorView } from "@codemirror/view"
import type { RefObject } from "react"
import { useEffect, useRef, useState } from "react"
import { getMarkdownPanelPosition } from "@/components/ui/LxMarkdown/utils/markdownPanelPosition"
import type {
  MarkdownSendPromptFlagOption,
  MarkdownSendPromptOption,
} from "@/features/markdown/commands/markdownSlashCommands"
import {
  getMarkdownSendPromptFlagOptions,
  getMarkdownSendPromptOptions,
  getMarkdownSlashCommandLine,
} from "@/features/markdown/commands/markdownSlashCommands"
import type {
  MarkdownPanelsContextRefs,
  MarkdownSendPromptFlagPanelState,
  MarkdownSendPromptPanelState,
} from "@/features/markdown/hooks/useMarkdownPanels.types"
import { launchNewCliTerminal } from "@/features/markdown/utils/markdownSendPromptDispatcher"
import { useTerminalStore } from "@/features/terminal/terminalStore"

/**
 * Prompt 发送目标面板及其标志位三级面板：状态同步、目标回显与终端实例联动。
 */
export const useMarkdownSendPromptPanel = ({
  editorViewRef,
  context,
}: {
  editorViewRef: RefObject<EditorView | null>
  context: Pick<MarkdownPanelsContextRefs, "localeRef" | "projectPathRef" | "worktreePathRef">
}) => {
  const { localeRef, projectPathRef, worktreePathRef } = context
  const sendPromptPanelRef = useRef<MarkdownSendPromptPanelState | null>(null)
  const activeSendPromptIndexRef = useRef(0)
  const sendPromptFlagPanelRef = useRef<MarkdownSendPromptFlagPanelState | null>(null)
  const activeSendPromptFlagIndexRef = useRef(0)
  const [sendPromptPanel, setSendPromptPanel] = useState<MarkdownSendPromptPanelState | null>(null)
  const [activeSendPromptIndex, setActiveSendPromptIndex] = useState(0)
  const [sendPromptFlagPanel, setSendPromptFlagPanel] =
    useState<MarkdownSendPromptFlagPanelState | null>(null)
  const [activeSendPromptFlagIndex, setActiveSendPromptFlagIndex] = useState(0)

  // 追踪用户主动通过面板触发新建的 CLI 类型，用于在新 Running 实例就绪后自动聚焦
  const pendingAutoSelectCliRef = useRef<string | null>(null)

  // 监听终端 Store 变化（如用户退出/关闭某个终端 Tab），实时刷新二级选择菜单中的可用实例列表
  useEffect(() => {
    const unsubscribe = useTerminalStore.subscribe((state) => {
      const currentSendPrompt = sendPromptPanelRef.current
      if (currentSendPrompt) {
        const nextOptions = getMarkdownSendPromptOptions(localeRef.current, state.tabs)
        const currentIds = currentSendPrompt.options.map((o) => o.id).join(",")
        const nextIds = nextOptions.map((o) => o.id).join(",")
        if (currentIds !== nextIds) {
          const nextPanel = {
            ...currentSendPrompt,
            options: nextOptions,
          }
          sendPromptPanelRef.current = nextPanel
          setSendPromptPanel(nextPanel)

          let nextActiveIndex = activeSendPromptIndexRef.current

          // 如果存在刚触发新建的 CLI，自动聚焦到新生成的对应 running 选项
          if (pendingAutoSelectCliRef.current) {
            const targetType = pendingAutoSelectCliRef.current
            const foundIndex = nextOptions.findIndex(
              (o) => o.targetType === targetType && o.isRunning,
            )
            if (foundIndex !== -1) {
              nextActiveIndex = foundIndex
              pendingAutoSelectCliRef.current = null
            }
          } else {
            nextActiveIndex = Math.min(
              activeSendPromptIndexRef.current,
              Math.max(0, nextOptions.length - 1),
            )
          }

          activeSendPromptIndexRef.current = nextActiveIndex
          setActiveSendPromptIndex(nextActiveIndex)
        }
      }
    })
    return unsubscribe
  }, [])

  // 当 /sendPrompt 二级面板打开时，启动 800ms 轻量轮询刷新底层 PTY 进程状态，面板关闭时自动停止
  useEffect(() => {
    if (!sendPromptPanel) return

    const timer = setInterval(() => {
      void useTerminalStore.getState().refreshRunningClis()
    }, 800)

    return () => {
      clearInterval(timer)
    }
  }, [Boolean(sendPromptPanel)])

  /**
   * 关闭 Prompt 发送目标选择面板。
   */
  const closeSendPromptPanel = (): void => {
    sendPromptPanelRef.current = null
    activeSendPromptIndexRef.current = 0
    setSendPromptPanel(null)
    setActiveSendPromptIndex(0)
  }

  /**
   * 关闭 Prompt 发送标志位选择面板。
   */
  const closeSendPromptFlagPanel = (): void => {
    sendPromptFlagPanelRef.current = null
    activeSendPromptFlagIndexRef.current = 0
    setSendPromptFlagPanel(null)
    setActiveSendPromptFlagIndex(0)
  }

  /**
   * 打开 Prompt 发送目标选择面板：以当前光标处命令行为锚，列出目标选项。
   */
  const openSendPromptPanel = (view: EditorView): void => {
    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    const commandLine = getMarkdownSlashCommandLine(line.text, line.from, line.to)
    const coords = view.coordsAtPos(cursor)
    if (!commandLine || !coords) return

    const tabs = useTerminalStore.getState().tabs
    const options = getMarkdownSendPromptOptions(localeRef.current, tabs)
    const panel = {
      options,
      line: commandLine,
      position: getMarkdownPanelPosition("file", coords),
    }
    sendPromptPanelRef.current = panel
    activeSendPromptIndexRef.current = 0
    setSendPromptPanel(panel)
    setActiveSendPromptIndex(0)

    // 异步触发一次底层 PTY 进程探测刷新，以确保动态启动的 CLI 能即时反映
    void useTerminalStore.getState().refreshRunningClis()
  }

  /**
   * 选中 Prompt 发送目标：
   * - 如果是带有 CLI 标签的未运行项（如 Claude Code / OpenCode 等静态启动项），仅在终端打开并启动对应 CLI，
   *   保持二级命令面板打开，并在探测到新 CLI 实例就绪后自动选中该 Running 项；
   * - 支持通过 mode 参数指定打开方式（auto: 自动/默认水平, horizontal: 向右分屏, vertical: 向下分屏, tab: 新建 Tab）；
   * - 如果是 Agent 或已在运行中的 CLI 实例（Running 项），把目标标识回显到命令行为 `/sendPrompt <目标> ` 并关闭面板，等待二次回车触发发送。
   */
  const selectSendPrompt = (
    option: MarkdownSendPromptOption,
    mode: "auto" | "horizontal" | "vertical" | "tab" = "auto",
  ): void => {
    const view = editorViewRef.current
    const panel = sendPromptPanelRef.current
    if (!view || !panel) return

    // 针对未运行的静态 CLI 选项：仅打开终端并启动 CLI，不关闭面板，等待启动后自动选中 Running 实例
    if (option.tag === "CLI" && !option.isRunning) {
      pendingAutoSelectCliRef.current = option.targetType
      void launchNewCliTerminal(option.targetType, {
        projectPath: projectPathRef.current,
        worktreePath: worktreePathRef.current ?? undefined,
        title: option.label,
        mode,
      })
      // 保持焦点在编辑器内
      view.focus()
      return
    }

    const insert = `${panel.line.value.split(" ")[0]} ${option.id} `
    view.dispatch({
      changes: { from: panel.line.from, to: panel.line.to, insert },
      selection: { anchor: panel.line.from + insert.length },
    })
    view.focus()
    closeSendPromptPanel()
  }

  /**
   * 更新 Prompt 发送目标选择面板的当前选项。
   */
  const handleSendPromptKey = (offset: number): boolean => {
    const panel = sendPromptPanelRef.current
    if (!panel) return false

    const nextIndex =
      (activeSendPromptIndexRef.current + offset + panel.options.length) % panel.options.length
    activeSendPromptIndexRef.current = nextIndex
    setActiveSendPromptIndex(nextIndex)
    return true
  }

  /**
   * 打开 Prompt 发送标志位选择面板：以当前光标处命令行为锚，列出三级标志位选项（如 -new）。
   */
  const openSendPromptFlagPanel = (view: EditorView, target: string, flagQuery = "-"): void => {
    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    const commandLine = getMarkdownSlashCommandLine(line.text, line.from, line.to)
    const coords = view.coordsAtPos(cursor)
    if (!commandLine || !coords) return

    const allOptions = getMarkdownSendPromptFlagOptions(localeRef.current)
    const options = allOptions.filter((opt) => opt.id.startsWith(flagQuery.toLowerCase()))
    if (options.length === 0) {
      closeSendPromptFlagPanel()
      return
    }

    const panel = {
      options,
      line: commandLine,
      target,
      position: getMarkdownPanelPosition("file", coords),
    }
    sendPromptFlagPanelRef.current = panel
    activeSendPromptFlagIndexRef.current = 0
    setSendPromptFlagPanel(panel)
    setActiveSendPromptFlagIndex(0)
  }

  /**
   * 选中 Prompt 发送标志位：把标志位（如 -new）回显到命令行为 `/sendPrompt <目标> <flag> `，
   * 等待二次回车触发发送。
   */
  const selectSendPromptFlag = (option: MarkdownSendPromptFlagOption): void => {
    const view = editorViewRef.current
    const panel = sendPromptFlagPanelRef.current
    if (!view || !panel) return

    const insert = `/sendPrompt ${panel.target} ${option.id} `
    view.dispatch({
      changes: { from: panel.line.from, to: panel.line.to, insert },
      selection: { anchor: panel.line.from + insert.length },
    })
    view.focus()
    closeSendPromptFlagPanel()
  }

  /**
   * 更新 Prompt 发送标志位选择面板的当前选项。
   */
  const handleSendPromptFlagKey = (offset: number): boolean => {
    const panel = sendPromptFlagPanelRef.current
    if (!panel) return false

    const nextIndex =
      (activeSendPromptFlagIndexRef.current + offset + panel.options.length) % panel.options.length
    activeSendPromptFlagIndexRef.current = nextIndex
    setActiveSendPromptFlagIndex(nextIndex)
    return true
  }

  return {
    sendPromptPanel,
    activeSendPromptIndex,
    sendPromptPanelRef,
    activeSendPromptIndexRef,
    sendPromptFlagPanel,
    activeSendPromptFlagIndex,
    sendPromptFlagPanelRef,
    activeSendPromptFlagIndexRef,
    closeSendPromptPanel,
    closeSendPromptFlagPanel,
    openSendPromptPanel,
    selectSendPrompt,
    handleSendPromptKey,
    openSendPromptFlagPanel,
    selectSendPromptFlag,
    handleSendPromptFlagKey,
  }
}
