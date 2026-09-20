import type { EditorView } from "@codemirror/view"
import type { GitWorktreeEntry } from "@shared/contracts/git"
import type { ProjectFileEntry, ReferencedProjectFileEntry } from "@shared/project"
import type { Locale } from "@shared/settings"
import type { RefObject } from "react"
import { useRef } from "react"
import type { MarkdownSlashCommand } from "@/features/markdown/commands/markdownSlashCommands"
import { useMarkdownBlockCommandPanel } from "@/features/markdown/hooks/useMarkdownBlockCommandPanel"
import {
  type MarkdownColonPanelState,
  useMarkdownColonPanel,
} from "@/features/markdown/hooks/useMarkdownColonPanel"
import { useMarkdownFileMentionPanel } from "@/features/markdown/hooks/useMarkdownFileMentionPanel"
import { useMarkdownGitWorktreePanel } from "@/features/markdown/hooks/useMarkdownGitWorktreePanel"
import type { MarkdownPanelsContextRefs } from "@/features/markdown/hooks/useMarkdownPanels.types"
import { useMarkdownSendPromptPanel } from "@/features/markdown/hooks/useMarkdownSendPromptPanel"
import { useMarkdownSlashCommandPanel } from "@/features/markdown/hooks/useMarkdownSlashCommandPanel"

export type {
  FileMentionPanelState,
  GitWorktreePanelState,
  MarkdownBlockCommandPanelState,
  MarkdownLetterPanelState,
  MarkdownSendPromptFlagPanelState,
  MarkdownSendPromptPanelState,
  MarkdownSlashCommandPanelState,
} from "@/features/markdown/hooks/useMarkdownPanels.types"
export type { MarkdownColonPanelState }

/**
 * 管理编辑器弹出面板（斜杠命令、块命令、文件提及、页面变量）的状态同步与交互。
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

  // 共享上下文 refs：子 Hook 在回调执行时读取最新值。
  const context: MarkdownPanelsContextRefs = {
    projectIdRef,
    projectPathRef,
    worktreePathRef,
    worktreesRef,
    projectBranchRef,
    reloadWorktreesRef,
    referencedProjectPathsRef,
    customSlashCommandsRef,
    localeRef,
    onSearchFilesRef,
    onSearchReferencedFilesRef,
    onSearchDirectoryFilesRef,
  }

  const colonPanelState = useMarkdownColonPanel(editorViewRef)

  const {
    blockCommandPanel,
    activeBlockCommandIndex,
    blockCommandPanelRef,
    activeBlockCommandIndexRef,
    syncBlockCommandPanel,
    selectBlockCommand,
    handleBlockCommandKey,
    setBlockCommandPanel,
  } = useMarkdownBlockCommandPanel({ editorViewRef, context })

  const {
    gitWorktreePanel,
    activeGitWorktreeIndex,
    gitWorktreePanelRef,
    activeGitWorktreeIndexRef,
    closeGitWorktreePanel,
    openGitWorktreePanel,
    selectGitWorktree,
    handleGitWorktreeKey,
  } = useMarkdownGitWorktreePanel({ editorViewRef, context })

  const {
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
  } = useMarkdownSendPromptPanel({ editorViewRef, context })

  const {
    slashCommandPanel,
    activeSlashCommandIndex,
    slashCommandPanelRef,
    activeSlashCommandIndexRef,
    closeSlashCommandPanel,
    syncSlashCommandPanel,
    selectSlashCommand,
    handleSlashCommandKey,
  } = useMarkdownSlashCommandPanel({
    editorViewRef,
    context,
    gitWorktreePanelRef,
    sendPromptPanelRef,
    sendPromptFlagPanelRef,
    closeGitWorktreePanel,
    closeSendPromptPanel,
    closeSendPromptFlagPanel,
    openGitWorktreePanel,
    openSendPromptPanel,
    openSendPromptFlagPanel,
  })

  const {
    fileMentionPanel,
    activeFileMentionIndex,
    fileMentionPanelRef,
    activeFileMentionIndexRef,
    closeFileMentionPanel,
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
    selectTemplateVariable,
    handleTemplateFileKey,
  } = useMarkdownFileMentionPanel({ editorViewRef, context })

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
    selectTemplateVariable,
    handleTemplateFileKey,
    syncBlockCommandPanel,
    selectBlockCommand,
    handleBlockCommandKey,
    setBlockCommandPanel,
    colonPanel: colonPanelState.colonPanelState,
    colonPanelRef: colonPanelState.colonPanelRef,
    activeColonOptionIndex: colonPanelState.activeColonOptionIndex,
    activeColonOptionIndexRef: colonPanelState.activeColonOptionIndexRef,
    syncColonPanel: colonPanelState.syncColonPanel,
    closeColonPanel: colonPanelState.closeColonPanel,
    handleColonKey: colonPanelState.handleColonKey,
    selectColonOption: colonPanelState.selectColonOption,
  }
}
