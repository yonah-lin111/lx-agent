import type { EditorView } from "@codemirror/view"
import type { GitWorktreeEntry } from "@shared/contracts/git"
import type { ProjectFileEntry, ReferencedProjectFileEntry } from "@shared/project"
import type { Locale } from "@shared/settings"
import type { CSSProperties, RefObject } from "react"
import { useEffect, useRef, useState } from "react"
import {
  buildGitWorktreeOptions,
  type GitWorktreeOption,
  getGitWorktreeDirName,
  getGitWorktreeDisplayName,
} from "@/features/git"
import type {
  MarkdownBlockCommand,
  MarkdownBlockTrigger,
} from "@/features/markdown/commands/markdownBlockCommands"
import {
  createMarkdownBlockInsertion,
  createMarkdownTemplateId,
  getMarkdownBlockCommands,
  getMarkdownBlockTrigger,
  getMarkdownTemplateBlockContent,
  getMarkdownTemplateBlockEndLine,
  getMarkdownTemplateWorktree,
  isInsideMarkdownCodeFence,
  isInsideMarkdownTemplateBlock,
} from "@/features/markdown/commands/markdownBlockCommands"
import { getMarkdownReferenceProjectPaths } from "@/features/markdown/commands/markdownReferenceCommands"
import type {
  MarkdownSendPromptFlagOption,
  MarkdownSendPromptOption,
  MarkdownSlashCommand,
  MarkdownSlashCommandLine,
} from "@/features/markdown/commands/markdownSlashCommands"
import {
  getMarkdownSendPromptFlagOptions,
  getMarkdownSendPromptOptions,
  getMarkdownSlashCommandLine,
  getMarkdownSlashCommands,
  isMarkdownConfirmCommandArmed,
} from "@/features/markdown/commands/markdownSlashCommands"
import {
  createMarkdownTemplateFileReference,
  filterMarkdownTemplateFileCandidates,
  getMarkdownTemplateFileCandidates,
  getMarkdownTemplateFileTrigger,
} from "@/features/markdown/commands/markdownTemplateFileCommands"
import { MARKDOWN_FILE_MENTION_PATH_PATTERN } from "@/features/markdown/extensions/markdownFileMentions"
import type { MarkdownFileMentionEntry } from "@/features/markdown/types"
import { launchNewCliTerminal } from "@/features/markdown/utils/markdownSendPromptDispatcher"
import { useTerminalStore } from "@/features/terminal/terminalStore"

/**
 * Prompt 发送目标面板状态。
 */
export interface MarkdownSendPromptPanelState {
  options: MarkdownSendPromptOption[]
  line: MarkdownSlashCommandLine
  position: CSSProperties
}

/**
 * Prompt 发送标志位（三级面板）状态。
 */
export interface MarkdownSendPromptFlagPanelState {
  options: MarkdownSendPromptFlagOption[]
  line: MarkdownSlashCommandLine
  target: string
  position: CSSProperties
}

/**
 * Markdown 块命令面板状态。
 */
export interface MarkdownBlockCommandPanelState {
  commands: MarkdownBlockCommand[]
  position: CSSProperties
  trigger: MarkdownBlockTrigger
}

/**
 * 文件提及面板状态。
 */
export interface FileMentionPanelState {
  files: MarkdownFileMentionEntry[]
  position: CSSProperties
  start: number
}

/**
 * Markdown 斜杠命令面板状态。
 */
export interface MarkdownSlashCommandPanelState {
  commands: MarkdownSlashCommand[]
  line: MarkdownSlashCommandLine
  position: CSSProperties
}

/**
 * git 工作区选择面板状态。
 */
export interface GitWorktreePanelState {
  options: GitWorktreeOption[]
  line: MarkdownSlashCommandLine
  position: CSSProperties
}

type MarkdownPanelKind = "block" | "file" | "slash"

/**
 * 将样式配置中的尺寸换算为像素，供面板边界定位使用。
 */
const getCssDimensionInPixels = (variableName: string): number => {
  const cssValue = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim()
  const value = Number.parseFloat(cssValue)
  if (!Number.isFinite(value)) return 0

  if (cssValue.endsWith("rem")) {
    return value * Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  }
  if (cssValue.endsWith("vh")) return (value / 100) * window.innerHeight
  if (cssValue.endsWith("vw")) return (value / 100) * window.innerWidth

  return value
}

/**
 * 根据 CSS 中的面板尺寸计算可视区域内的位置。
 */
const getMarkdownPanelPosition = (
  kind: MarkdownPanelKind,
  coords: { bottom: number; left: number; top: number },
  horizontalPosition = coords.left,
): CSSProperties => {
  const panelWidth = getCssDimensionInPixels(`--markdown-command-menu-${kind}-width`)
  const maxHeight = getCssDimensionInPixels(`--markdown-command-menu-${kind}-max-height`)
  const offset = 6
  const left = Math.min(
    Math.max(horizontalPosition, 8),
    Math.max(window.innerWidth - panelWidth - 8, 8),
  )

  return window.innerHeight - coords.bottom < maxHeight
    ? { left, top: "auto", bottom: window.innerHeight - coords.top + offset }
    : { left, top: coords.bottom + offset, bottom: "auto" }
}

/**
 * 管理编辑器弹出面板（斜杠命令、块命令、文件提及）的状态同步与交互。
 */
export const useMarkdownPanels = ({
  editorViewRef,
  projectId,
  onSearchFiles,
  onSearchReferencedFiles,
  onSearchDirectoryFiles,
  referencedProjectPaths = [],
  projectPath,
  worktreePath,
  worktrees,
  projectBranch,
  reloadWorktrees,
  customSlashCommands = [],
  locale = "zh",
}: {
  editorViewRef: RefObject<EditorView | null>
  projectId?: string
  onSearchFiles?: (projectId: string, query: string) => Promise<ProjectFileEntry[]>
  onSearchReferencedFiles?: (
    projectPaths: string[],
    query: string,
  ) => Promise<ReferencedProjectFileEntry[]>
  onSearchDirectoryFiles?: (directory: string, query: string) => Promise<ProjectFileEntry[]>
  // 已启用（参与 @ 搜索）的共享文件夹绝对路径。
  referencedProjectPaths?: string[]
  // 当前项目文件系统路径（@ 搜索根与工作区上下文判定用）。
  projectPath?: string
  // 当前条目全局绑定的 git 工作区绝对路径。
  worktreePath?: string
  // 项目所在仓库的工作区列表；非 git 仓库为 null。
  worktrees?: GitWorktreeEntry[] | null
  // 项目当前分支（默认工作区展示名）。
  projectBranch?: string | null
  // 主动重拉工作区列表（打开二级面板时若尚未加载则调用）。
  reloadWorktrees?: () => void
  // 自定义 Markdown 斜杠命令列表。
  customSlashCommands?: MarkdownSlashCommand[]
  // 语言环境（内置模板多语言）。
  locale?: Locale
}) => {
  const blockCommandPanelRef = useRef<MarkdownBlockCommandPanelState | null>(null)
  const activeBlockCommandIndexRef = useRef(0)
  const slashCommandPanelRef = useRef<MarkdownSlashCommandPanelState | null>(null)
  const activeSlashCommandIndexRef = useRef(0)
  const gitWorktreePanelRef = useRef<GitWorktreePanelState | null>(null)
  const activeGitWorktreeIndexRef = useRef(0)
  const sendPromptPanelRef = useRef<MarkdownSendPromptPanelState | null>(null)
  const activeSendPromptIndexRef = useRef(0)
  const sendPromptFlagPanelRef = useRef<MarkdownSendPromptFlagPanelState | null>(null)
  const activeSendPromptFlagIndexRef = useRef(0)
  const fileMentionPanelRef = useRef<FileMentionPanelState | null>(null)
  const activeFileMentionIndexRef = useRef(0)
  const fileSearchRequestRef = useRef(0)
  const templateFilePanelRef = useRef<FileMentionPanelState | null>(null)
  const activeTemplateFileIndexRef = useRef(0)
  const onSearchFilesRef = useRef(onSearchFiles)
  const onSearchReferencedFilesRef = useRef(onSearchReferencedFiles)
  const onSearchDirectoryFilesRef = useRef(onSearchDirectoryFiles)
  const projectIdRef = useRef(projectId)
  const projectPathRef = useRef(projectPath)
  const worktreePathRef = useRef(worktreePath)
  const worktreesRef = useRef(worktrees)
  const projectBranchRef = useRef(projectBranch)
  const reloadWorktreesRef = useRef(reloadWorktrees)
  const referencedProjectPathsRef = useRef(referencedProjectPaths)
  const customSlashCommandsRef = useRef(customSlashCommands)
  const localeRef = useRef(locale)

  const [blockCommandPanel, setBlockCommandPanel] = useState<MarkdownBlockCommandPanelState | null>(
    null,
  )
  const [activeBlockCommandIndex, setActiveBlockCommandIndex] = useState(0)
  const [slashCommandPanel, setSlashCommandPanel] = useState<MarkdownSlashCommandPanelState | null>(
    null,
  )
  const [activeSlashCommandIndex, setActiveSlashCommandIndex] = useState(0)
  const [gitWorktreePanel, setGitWorktreePanel] = useState<GitWorktreePanelState | null>(null)
  const [activeGitWorktreeIndex, setActiveGitWorktreeIndex] = useState(0)
  const [sendPromptPanel, setSendPromptPanel] = useState<MarkdownSendPromptPanelState | null>(null)
  const [activeSendPromptIndex, setActiveSendPromptIndex] = useState(0)
  const [sendPromptFlagPanel, setSendPromptFlagPanel] =
    useState<MarkdownSendPromptFlagPanelState | null>(null)
  const [activeSendPromptFlagIndex, setActiveSendPromptFlagIndex] = useState(0)
  const [fileMentionPanel, setFileMentionPanel] = useState<FileMentionPanelState | null>(null)
  const [activeFileMentionIndex, setActiveFileMentionIndex] = useState(0)
  const [templateFilePanel, setTemplateFilePanel] = useState<FileMentionPanelState | null>(null)
  const [activeTemplateFileIndex, setActiveTemplateFileIndex] = useState(0)

  onSearchFilesRef.current = onSearchFiles
  onSearchReferencedFilesRef.current = onSearchReferencedFiles
  onSearchDirectoryFilesRef.current = onSearchDirectoryFiles
  projectIdRef.current = projectId
  projectPathRef.current = projectPath
  worktreePathRef.current = worktreePath
  worktreesRef.current = worktrees
  projectBranchRef.current = projectBranch
  reloadWorktreesRef.current = reloadWorktrees
  referencedProjectPathsRef.current = referencedProjectPaths
  customSlashCommandsRef.current = customSlashCommands
  localeRef.current = locale

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
   * 关闭文件提及面板并取消过期查询结果。
   */
  const closeFileMentionPanel = (): void => {
    fileSearchRequestRef.current += 1
    fileMentionPanelRef.current = null
    activeFileMentionIndexRef.current = 0
    setFileMentionPanel(null)
    setActiveFileMentionIndex(0)
  }

  /**
   * 关闭模板块文件快捷输入面板。
   */
  const closeTemplateFilePanel = (): void => {
    templateFilePanelRef.current = null
    activeTemplateFileIndexRef.current = 0
    setTemplateFilePanel(null)
    setActiveTemplateFileIndex(0)
  }

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
   * 关闭 git 工作区选择面板。
   */
  const closeGitWorktreePanel = (): void => {
    gitWorktreePanelRef.current = null
    activeGitWorktreeIndexRef.current = 0
    setGitWorktreePanel(null)
    setActiveGitWorktreeIndex(0)
  }

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

    // 检查是否处于 3 级标志位输入态（如 /sendPrompt opencode - 或 /sendPrompt opencode:my-dev -n）
    const flagMatch = /^\/sendPrompt\s+([^\s]+)\s+(-[a-zA-Z0-9_-]*)$/i.exec(
      commandLine?.value ?? "",
    )
    if (flagMatch && isInsideTemplateBlock) {
      closeSlashCommandPanel()
      closeSendPromptPanel()
      openSendPromptFlagPanel(view, flagMatch[1], flagMatch[2])
      return
    } else if (sendPromptFlagPanelRef.current) {
      closeSendPromptFlagPanel()
    }

    // 已武装的确认命令行不弹面板，等待二次回车触发。
    const isArmed = commandLine
      ? isMarkdownConfirmCommandArmed(
          commandLine.value,
          isInsideTemplateBlock,
          customSlashCommandsRef.current,
        )
      : false
    const commands = commandLine
      ? getMarkdownSlashCommands(
          commandLine.value,
          isInsideTemplateBlock,
          Boolean(projectPathRef.current) && worktreesRef.current !== null,
          customSlashCommandsRef.current,
          localeRef.current,
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
   * 打开 git 工作区选择面板：以当前光标处命令行为锚，列出工作区选项。
   * projectPath 缺失（virtual）不打开；非 git 仓库（worktrees 为 null）触发重拉并暂不打开。
   */
  const openGitWorktreePanel = (view: EditorView): void => {
    const projectPath = projectPathRef.current
    if (!projectPath) return

    const worktrees = worktreesRef.current
    if (worktrees == null) {
      reloadWorktreesRef.current?.()
      return
    }

    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    const commandLine = getMarkdownSlashCommandLine(line.text, line.from, line.to)
    const coords = view.coordsAtPos(cursor)
    if (!commandLine || !coords) return

    const context = resolveContextDirectory(view)
    const options = buildGitWorktreeOptions({
      worktrees,
      projectPath,
      projectBranch: projectBranchRef.current ?? null,
      worktreePath: context?.directory ?? worktreePathRef.current,
    })
    const panel = {
      options,
      line: commandLine,
      position: getMarkdownPanelPosition("file", coords),
    }
    gitWorktreePanelRef.current = panel
    activeGitWorktreeIndexRef.current = 0
    setGitWorktreePanel(panel)
    setActiveGitWorktreeIndex(0)
  }

  /**
   * 选中工作区选项：把分支名（detached 用目录名）回显到命令行为 `/gitWorktree <名> `，
   * 等待二次回车触发切换；默认工作区选中即回显默认分支名。
   */
  const selectGitWorktree = (option: GitWorktreeOption): void => {
    const view = editorViewRef.current
    const panel = gitWorktreePanelRef.current
    if (!view || !panel) return

    const insert = `${panel.line.value.split(" ")[0]} ${option.name} `
    view.dispatch({
      changes: { from: panel.line.from, to: panel.line.to, insert },
      selection: { anchor: panel.line.from + insert.length },
    })
    view.focus()
    closeGitWorktreePanel()
  }

  /**
   * 更新 git 工作区选择面板的当前选项。
   */
  const handleGitWorktreeKey = (offset: number): boolean => {
    const panel = gitWorktreePanelRef.current
    if (!panel) return false

    const nextIndex =
      (activeGitWorktreeIndexRef.current + offset + panel.options.length) % panel.options.length
    activeGitWorktreeIndexRef.current = nextIndex
    setActiveGitWorktreeIndex(nextIndex)
    return true
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

  /**
   * 用选中的模板替换当前斜杠命令行。
   */
  const selectSlashCommand = (command: MarkdownSlashCommand): void => {
    const view = editorViewRef.current
    const panel = slashCommandPanelRef.current
    if (!view || !panel) return

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

    // 选择型命令（/gitWorktree、/sendPrompt）：回显命令文本后打开二级工作区/目标面板，选中后回显分支名/目标、回车触发。
    if (command.kind === "select") {
      view.dispatch({
        changes: { from: panel.line.from, to: panel.line.to, insert: command.content },
        selection: { anchor: panel.line.from + command.content.length },
      })
      view.focus()
      closeSlashCommandPanel()
      if (command.id === "sendPrompt") {
        openSendPromptPanel(view)
      } else {
        openGitWorktreePanel(view)
      }
      return
    }

    // 自定义模板命令：直接将 content 插入光标行。
    if (command.kind === "customTemplate") {
      view.dispatch({
        changes: { from: panel.line.from, to: panel.line.to, insert: command.content },
        selection: { anchor: panel.line.from + command.cursorOffset },
      })
      view.focus()
      closeSlashCommandPanel()
      return
    }

    // 直接命令（scope=normal）插入时在结束行 &&& 后追加唯一 id；光标位置不受影响。
    const content =
      command.scope === "normal"
        ? command.content.replace(/&&&$/, `&&& {id:${createMarkdownTemplateId()}}`)
        : command.content

    view.dispatch({
      changes: { from: panel.line.from, to: panel.line.to, insert: content },
      selection: { anchor: panel.line.from + command.cursorOffset },
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

  /**
   * 解析光标处的 git 工作区上下文目录：模板块内优先取块结束行 {wt:} 的局部绑定，
   * 否则取全局 worktreePath ?? projectPath；无 git 上下文（virtual 项目）返回 null。
   */
  const resolveContextDirectory = (
    view: EditorView,
  ): { directory: string; worktreeName: string } | null => {
    const projectPath = projectPathRef.current
    const worktrees = worktreesRef.current
    const cursor = view.state.selection.main.head
    const docText = view.state.doc.toString()

    // 模板块局部绑定：当前块结束行带 {wt:分支名} 时，解析为该工作区路径。
    const endLine = getMarkdownTemplateBlockEndLine(docText, cursor)
    if (endLine !== null) {
      const branch = getMarkdownTemplateWorktree(view.state.doc.line(endLine).text)
      if (branch) {
        const entry = worktrees?.find((item) => item.branch === branch)
        if (entry) {
          return { directory: entry.path, worktreeName: getGitWorktreeDisplayName(entry) }
        }
      }
    }

    // 全局绑定：worktreePath ?? projectPath。
    const directory = worktreePathRef.current ?? projectPath
    if (!directory) return null

    const entry = worktrees?.find((item) => item.path === directory)
    const worktreeName =
      entry?.branch ?? projectBranchRef.current ?? getGitWorktreeDirName(directory)
    return { directory, worktreeName }
  }

  /**
   * 根据光标前的 @ 查询同步项目文件提及面板。
   */
  const syncFileMentionPanel = (view: EditorView): void => {
    const searchFiles = onSearchFilesRef.current
    const searchReferencedFiles = onSearchReferencedFilesRef.current
    const searchDirectoryFiles = onSearchDirectoryFilesRef.current
    const activeProjectId = projectIdRef.current
    const cursor = view.state.selection.main.head
    const docText = view.state.doc.toString()
    const prefix = view.state.doc.sliceString(0, cursor)
    const match = new RegExp(
      String.raw`(^|\s)@((?:${MARKDOWN_FILE_MENTION_PATH_PATTERN})?)$`,
      "u",
    ).exec(prefix)
    const templateBlockContent = getMarkdownTemplateBlockContent(docText, cursor)
    const searchProjectPaths = [
      ...new Set([
        ...referencedProjectPathsRef.current,
        ...getMarkdownReferenceProjectPaths(templateBlockContent ?? docText),
      ]),
    ]
    const context = resolveContextDirectory(view)
    const canSearchCurrentProject = Boolean(
      context && (searchDirectoryFiles || (searchFiles && activeProjectId)),
    )
    const canSearchReferencedProjects = Boolean(
      searchReferencedFiles && searchProjectPaths.length > 0,
    )

    if (!match || (!canSearchCurrentProject && !canSearchReferencedProjects)) {
      closeFileMentionPanel()
      return
    }

    const coords = view.coordsAtPos(cursor)
    if (!coords) {
      closeFileMentionPanel()
      return
    }

    const requestId = fileSearchRequestRef.current + 1
    fileSearchRequestRef.current = requestId
    const query = match[2] ?? ""
    const start = cursor - query.length - 1

    const currentProjectSearch = canSearchCurrentProject
      ? (context!.directory === projectPathRef.current && searchFiles && activeProjectId
          ? searchFiles(activeProjectId, query)
          : searchDirectoryFiles!(context!.directory, query)
        ).then((files) =>
          files.map((file) => ({
            ...file,
            mentionPath: file.path,
            source: "current" as const,
            worktreeName: context!.worktreeName,
          })),
        )
      : Promise.resolve([])
    const referencedProjectSearch = canSearchReferencedProjects
      ? searchReferencedFiles!(searchProjectPaths, query).then((files) =>
          files.map((file) => ({
            ...file,
            mentionPath: `${file.projectPath.replace(/[\\/]+$/, "")}/${file.path}`,
            source: "reference" as const,
          })),
        )
      : Promise.resolve([])

    void Promise.all([currentProjectSearch, referencedProjectSearch])
      .then(([currentProjectFiles, referencedProjectFiles]) => {
        if (fileSearchRequestRef.current !== requestId) return
        const files = [...currentProjectFiles, ...referencedProjectFiles]
        if (files.length === 0) {
          fileMentionPanelRef.current = null
          setFileMentionPanel(null)
          return
        }

        const position = getMarkdownPanelPosition("file", coords)
        const panel = { files, position, start }
        fileMentionPanelRef.current = panel
        activeFileMentionIndexRef.current = 0
        setFileMentionPanel(panel)
        setActiveFileMentionIndex(0)
      })
      .catch(() => closeFileMentionPanel())
  }

  /**
   * 将选中的项目相对路径插入当前 @ 提及位置。
   */
  const selectFileMention = (file: MarkdownFileMentionEntry): void => {
    const view = editorViewRef.current
    const panel = fileMentionPanelRef.current
    if (!view || !panel) return

    const cursor = view.state.selection.main.head
    const insertion = `@${file.mentionPath} `
    view.dispatch({
      changes: { from: panel.start, to: cursor, insert: insertion },
      selection: { anchor: panel.start + insertion.length },
    })
    view.focus()
    closeFileMentionPanel()
  }

  /**
   * 处理文件提及面板的键盘导航。
   */
  const handleFileMentionKey = (key: "ArrowDown" | "ArrowUp"): boolean => {
    const panel = fileMentionPanelRef.current
    if (!panel) return false

    const offset = key === "ArrowDown" ? 1 : -1
    const nextIndex =
      (activeFileMentionIndexRef.current + offset + panel.files.length) % panel.files.length
    activeFileMentionIndexRef.current = nextIndex
    setActiveFileMentionIndex(nextIndex)
    return true
  }

  /**
   * 根据模板块内的裸片段同步文件快捷输入面板。
   * 候选仅取当前模板块正文中已出现的引用（@ 提及 / 引用文件 / 引用文件夹）；
   * 仅在光标处于模板块内且不在代码围栏或模板块标记行时触发，@ 前缀由文件提及面板处理。
   */
  const syncTemplateFilePanel = (view: EditorView): void => {
    const cursor = view.state.selection.main.head
    const docText = view.state.doc.toString()
    const prefix = view.state.doc.sliceString(0, cursor)
    const lineText = view.state.doc.lineAt(cursor).text

    if (isInsideMarkdownCodeFence(prefix) || /^\s*&&&/.test(lineText)) {
      closeTemplateFilePanel()
      return
    }

    const blockContent = getMarkdownTemplateBlockContent(docText, cursor)
    if (!blockContent) {
      closeTemplateFilePanel()
      return
    }

    const trigger = getMarkdownTemplateFileTrigger(prefix)
    if (!trigger) {
      closeTemplateFilePanel()
      return
    }

    const coords = view.coordsAtPos(cursor)
    if (!coords) {
      closeTemplateFilePanel()
      return
    }

    const referencedRoots = [
      ...new Set([
        ...referencedProjectPathsRef.current,
        ...getMarkdownReferenceProjectPaths(blockContent),
      ]),
    ]
    const matched = filterMarkdownTemplateFileCandidates(
      getMarkdownTemplateFileCandidates(blockContent, referencedRoots),
      trigger.fragment,
    )
    if (matched.length === 0) {
      templateFilePanelRef.current = null
      setTemplateFilePanel(null)
      return
    }

    const files: MarkdownFileMentionEntry[] = matched.map((candidate) => ({
      path: candidate.path,
      isDirectory: candidate.isDirectory,
      mentionPath: candidate.path,
      source: "current" as const,
      templateKind: candidate.kind,
    }))
    const position = getMarkdownPanelPosition("file", coords)
    const panel = { files, position, start: trigger.start }
    templateFilePanelRef.current = panel
    activeTemplateFileIndexRef.current = 0
    setTemplateFilePanel(panel)
    setActiveTemplateFileIndex(0)
  }

  /**
   * 将选中的文件引用插入当前裸片段位置。
   */
  const selectTemplateFile = (file: MarkdownFileMentionEntry): void => {
    const view = editorViewRef.current
    const panel = templateFilePanelRef.current
    if (!view || !panel) return

    const cursor = view.state.selection.main.head
    const insertion = createMarkdownTemplateFileReference(file)
    view.dispatch({
      changes: { from: panel.start, to: cursor, insert: insertion },
      selection: { anchor: panel.start + insertion.length },
    })
    view.focus()
    closeTemplateFilePanel()
  }

  /**
   * 处理模板块文件快捷输入面板的键盘导航。
   */
  const handleTemplateFileKey = (offset: number): boolean => {
    const panel = templateFilePanelRef.current
    if (!panel) return false

    const nextIndex =
      (activeTemplateFileIndexRef.current + offset + panel.files.length) % panel.files.length
    activeTemplateFileIndexRef.current = nextIndex
    setActiveTemplateFileIndex(nextIndex)
    return true
  }

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
        ? getMarkdownBlockCommands(trigger.kind)
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
    activeBlockCommandIndexRef,
    slashCommandPanelRef,
    activeSlashCommandIndexRef,
    gitWorktreePanelRef,
    activeGitWorktreeIndexRef,
    sendPromptPanelRef,
    activeSendPromptIndexRef,
    sendPromptFlagPanelRef,
    activeSendPromptFlagIndexRef,
    fileMentionPanelRef,
    activeFileMentionIndexRef,
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
    openSendPromptPanel,
    selectSendPrompt,
    handleSendPromptKey,
    openSendPromptFlagPanel,
    selectSendPromptFlag,
    handleSendPromptFlagKey,
    syncFileMentionPanel,
    selectFileMention,
    handleFileMentionKey,
    templateFilePanel,
    activeTemplateFileIndex,
    templateFilePanelRef,
    activeTemplateFileIndexRef,
    closeTemplateFilePanel,
    syncTemplateFilePanel,
    selectTemplateFile,
    handleTemplateFileKey,
    syncBlockCommandPanel,
    selectBlockCommand,
    handleBlockCommandKey,
    setBlockCommandPanel,
  }
}
