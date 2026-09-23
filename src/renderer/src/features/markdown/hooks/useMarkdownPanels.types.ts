import type { GitWorktreeEntry } from "@shared/contracts/git"
import type { ProjectFileEntry, ReferencedProjectFileEntry } from "@shared/project"
import type { Locale } from "@shared/settings"
import type { CSSProperties, RefObject } from "react"
import type { GitWorktreeOption } from "@/features/git"
import type {
  MarkdownSendPromptFlagOption,
  MarkdownSendPromptOption,
  MarkdownSlashCommand,
  MarkdownSlashCommandLine,
} from "@/features/markdown/commands/markdownSlashCommands"
import type { MarkdownVariableEntry } from "@/features/markdown/commands/markdownVariableCommands"
import type { MarkdownFileMentionEntry } from "@/features/markdown/types"

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
 * 文件提及面板状态。
 */
export interface FileMentionPanelState {
  files: MarkdownFileMentionEntry[]
  position: CSSProperties
  start: number
}

/**
 * 字母快捷输入面板状态：文件/引用候选 + 页面变量候选合并展示。
 */
export interface MarkdownLetterPanelState {
  files: MarkdownFileMentionEntry[]
  variables: MarkdownVariableEntry[]
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

// 项目文件搜索回调。
export type MarkdownPanelSearchFiles = (
  projectId: string,
  query: string,
) => Promise<ProjectFileEntry[]>

// 引用项目文件搜索回调。
export type MarkdownPanelSearchReferencedFiles = (
  projectPaths: string[],
  query: string,
) => Promise<ReferencedProjectFileEntry[]>

// 指定目录文件搜索回调。
export type MarkdownPanelSearchDirectoryFiles = (
  directory: string,
  query: string,
) => Promise<ProjectFileEntry[]>

/**
 * 面板共享上下文 refs：由协调层逐次渲染写入最新值，子 Hook 在回调执行时读取。
 */
export interface MarkdownPanelsContextRefs {
  // 当前项目 id（@ 搜索用）。
  projectIdRef: RefObject<string | undefined>
  // 当前项目文件系统路径（@ 搜索根与工作区上下文判定用）。
  projectPathRef: RefObject<string | undefined>
  // 当前条目全局绑定的 git 工作区绝对路径。
  worktreePathRef: RefObject<string | undefined>
  // 项目所在仓库的工作区列表；非 git 仓库为 null。
  worktreesRef: RefObject<GitWorktreeEntry[] | null | undefined>
  // 项目当前分支（默认工作区展示名）。
  projectBranchRef: RefObject<string | null | undefined>
  // 主动重拉工作区列表（打开二级面板时若尚未加载则调用）。
  reloadWorktreesRef: RefObject<(() => void) | undefined>
  // 已启用（参与 @ 搜索）的共享文件夹绝对路径。
  referencedProjectPathsRef: RefObject<string[]>
  // 自定义 Markdown 斜杠命令列表。
  customSlashCommandsRef: RefObject<MarkdownSlashCommand[]>
  // 语言环境（内置模板多语言）。
  localeRef: RefObject<Locale>
  // 项目文件搜索。
  onSearchFilesRef: RefObject<MarkdownPanelSearchFiles | undefined>
  // 引用项目文件搜索。
  onSearchReferencedFilesRef: RefObject<MarkdownPanelSearchReferencedFiles | undefined>
  // 指定目录文件搜索。
  onSearchDirectoryFilesRef: RefObject<MarkdownPanelSearchDirectoryFiles | undefined>
}
