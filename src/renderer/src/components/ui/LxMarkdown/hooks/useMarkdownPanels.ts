import type { EditorView } from "@codemirror/view"
import type { ProjectFileEntry, ReferencedProjectFileEntry } from "@shared/project"
import type { CSSProperties, RefObject } from "react"
import { useEffect, useRef, useState } from "react"
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
import type {
  MarkdownReferenceCommand,
  MarkdownReferenceType,
} from "@/components/ui/LxMarkdown/commands/markdownReferenceCommands"
import {
  createMarkdownReference,
  getMarkdownReferenceCommands,
  getMarkdownReferenceName,
  getMarkdownReferenceProjectPaths,
} from "@/components/ui/LxMarkdown/commands/markdownReferenceCommands"
import type {
  MarkdownSlashCommand,
  MarkdownSlashCommandLine,
} from "@/components/ui/LxMarkdown/commands/markdownSlashCommands"
import {
  getMarkdownSlashCommandLine,
  getMarkdownSlashCommands,
} from "@/components/ui/LxMarkdown/commands/markdownSlashCommands"
import type { MarkdownFileMentionEntry } from "@/components/ui/LxMarkdown/types"

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
 * Markdown 引用命令面板状态。
 */
export interface MarkdownReferenceCommandPanelState {
  commands: MarkdownReferenceCommand[]
  from: number
  path: string
  position: CSSProperties
  to: number
}

type MarkdownPanelKind = "block" | "file" | "reference" | "slash"

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
}: {
  editorViewRef: RefObject<EditorView | null>
  projectId?: string
  onSearchFiles?: (projectId: string, query: string) => Promise<ProjectFileEntry[]>
  onSearchReferencedFiles?: (
    projectPaths: string[],
    query: string,
  ) => Promise<ReferencedProjectFileEntry[]>
}) => {
  const blockCommandPanelRef = useRef<MarkdownBlockCommandPanelState | null>(null)
  const activeBlockCommandIndexRef = useRef(0)
  const slashCommandPanelRef = useRef<MarkdownSlashCommandPanelState | null>(null)
  const activeSlashCommandIndexRef = useRef(0)
  const fileMentionPanelRef = useRef<FileMentionPanelState | null>(null)
  const activeFileMentionIndexRef = useRef(0)
  const referenceCommandPanelRef = useRef<MarkdownReferenceCommandPanelState | null>(null)
  const activeReferenceCommandIndexRef = useRef(0)
  const fileSearchRequestRef = useRef(0)
  const onSearchFilesRef = useRef(onSearchFiles)
  const onSearchReferencedFilesRef = useRef(onSearchReferencedFiles)
  const projectIdRef = useRef(projectId)

  const [blockCommandPanel, setBlockCommandPanel] = useState<MarkdownBlockCommandPanelState | null>(
    null,
  )
  const [activeBlockCommandIndex, setActiveBlockCommandIndex] = useState(0)
  const [slashCommandPanel, setSlashCommandPanel] = useState<MarkdownSlashCommandPanelState | null>(
    null,
  )
  const [activeSlashCommandIndex, setActiveSlashCommandIndex] = useState(0)
  const [fileMentionPanel, setFileMentionPanel] = useState<FileMentionPanelState | null>(null)
  const [activeFileMentionIndex, setActiveFileMentionIndex] = useState(0)
  const [referenceCommandPanel, setReferenceCommandPanel] =
    useState<MarkdownReferenceCommandPanelState | null>(null)
  const [activeReferenceCommandIndex, setActiveReferenceCommandIndex] = useState(0)

  useEffect(() => {
    onSearchFilesRef.current = onSearchFiles
    onSearchReferencedFilesRef.current = onSearchReferencedFiles
    projectIdRef.current = projectId
  }, [onSearchFiles, onSearchReferencedFiles, projectId])

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
   * 关闭 Markdown 斜杠命令面板。
   */
  const closeSlashCommandPanel = (): void => {
    slashCommandPanelRef.current = null
    activeSlashCommandIndexRef.current = 0
    setSlashCommandPanel(null)
    setActiveSlashCommandIndex(0)
  }

  /**
   * 关闭路径引用命令面板。
   */
  const closeReferenceCommandPanel = (): void => {
    referenceCommandPanelRef.current = null
    activeReferenceCommandIndexRef.current = 0
    setReferenceCommandPanel(null)
    setActiveReferenceCommandIndex(0)
  }

  /**
   * 在当前选区旁打开路径引用命令面板。
   */
  const openReferenceCommandPanel = (path: string, view: EditorView): void => {
    const { from, to } = view.state.selection.main
    const insertedTo = from + path.length

    view.dispatch({
      changes: { from, to, insert: path },
      selection: { anchor: insertedTo },
      userEvent: "input.paste",
    })

    const coords = view.coordsAtPos(insertedTo)
    if (!coords) return

    const panel = {
      commands: getMarkdownReferenceCommands(),
      from,
      path,
      position: getMarkdownPanelPosition("reference", coords),
      to: insertedTo,
    }

    closeFileMentionPanel()
    closeSlashCommandPanel()
    referenceCommandPanelRef.current = panel
    activeReferenceCommandIndexRef.current = 0
    setReferenceCommandPanel(panel)
    setActiveReferenceCommandIndex(0)
  }

  /**
   * 将选中的引用类型写入粘贴路径所在的选区。
   */
  const selectReferenceCommand = (type: MarkdownReferenceType): void => {
    const view = editorViewRef.current
    const panel = referenceCommandPanelRef.current
    if (!view || !panel) return

    const insertion = `${createMarkdownReference(type, panel.path)} `
    view.dispatch({
      changes: { from: panel.from, to: panel.to, insert: insertion },
      selection: { anchor: panel.from + insertion.length },
      userEvent: "input.paste",
    })
    view.focus()
    closeReferenceCommandPanel()
  }

  /**
   * 切换路径引用命令的高亮项。
   */
  const handleReferenceCommandKey = (offset: number): boolean => {
    const panel = referenceCommandPanelRef.current
    if (!panel) return false

    const nextIndex =
      (activeReferenceCommandIndexRef.current + offset + panel.commands.length) %
      panel.commands.length
    activeReferenceCommandIndexRef.current = nextIndex
    setActiveReferenceCommandIndex(nextIndex)
    return true
  }

  /**
   * 同步 Markdown 光标处的模板命令面板。
   */
  const syncSlashCommandPanel = (view: EditorView): void => {
    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    const commandLine = getMarkdownSlashCommandLine(line.text, line.from, line.to)
    const commands = commandLine ? getMarkdownSlashCommands(commandLine.value) : []
    const coords = view.coordsAtPos(cursor)

    if (!commandLine || !coords || commands.length === 0) {
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

    view.dispatch({
      changes: { from: panel.line.from, to: panel.line.to, insert: command.content },
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
   * 根据光标前的 @ 查询同步项目文件提及面板。
   */
  const syncFileMentionPanel = (view: EditorView): void => {
    const searchFiles = onSearchFilesRef.current
    const searchReferencedFiles = onSearchReferencedFilesRef.current
    const activeProjectId = projectIdRef.current
    const cursor = view.state.selection.main.head
    const prefix = view.state.doc.sliceString(0, cursor)
    const match = /(^|\s)@([^\s]*)$/.exec(prefix)
    const referencedProjectPaths = getMarkdownReferenceProjectPaths(view.state.doc.toString())
    const canSearchCurrentProject = Boolean(searchFiles && activeProjectId)
    const canSearchReferencedProjects = Boolean(
      searchReferencedFiles && referencedProjectPaths.length > 0,
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
      ? searchFiles!(activeProjectId!, query).then((files) =>
          files.map((file) => ({ ...file, mentionPath: file.path, source: "current" as const })),
        )
      : Promise.resolve([])
    const referencedProjectSearch = canSearchReferencedProjects
      ? searchReferencedFiles!(referencedProjectPaths, query).then((files) =>
          files.map((file) => ({
            ...file,
            mentionPath: `${getMarkdownReferenceName(file.projectPath)}/${file.path}`,
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
    fileMentionPanel,
    activeFileMentionIndex,
    referenceCommandPanel,
    activeReferenceCommandIndex,
    blockCommandPanelRef,
    activeBlockCommandIndexRef,
    slashCommandPanelRef,
    activeSlashCommandIndexRef,
    fileMentionPanelRef,
    activeFileMentionIndexRef,
    referenceCommandPanelRef,
    activeReferenceCommandIndexRef,
    closeFileMentionPanel,
    closeSlashCommandPanel,
    closeReferenceCommandPanel,
    openReferenceCommandPanel,
    selectReferenceCommand,
    handleReferenceCommandKey,
    syncSlashCommandPanel,
    selectSlashCommand,
    handleSlashCommandKey,
    syncFileMentionPanel,
    selectFileMention,
    handleFileMentionKey,
    syncBlockCommandPanel,
    selectBlockCommand,
    handleBlockCommandKey,
    setBlockCommandPanel,
  }
}
