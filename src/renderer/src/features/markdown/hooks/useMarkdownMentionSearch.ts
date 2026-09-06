import type { EditorView } from "@codemirror/view"
import type { GitWorktreeEntry } from "@shared/contracts/git"
import type { ProjectFileEntry, ReferencedProjectFileEntry } from "@shared/project"
import type { MutableRefObject } from "react"
import {
  getGitWorktreeDirName,
  getGitWorktreeDisplayName,
} from "@/features/git"
import {
  getMarkdownSuppleBlockEndLine,
  getMarkdownSuppleWorktree,
  getMarkdownTemplateBlockContent,
  getMarkdownTemplateBlockEndLine,
  getMarkdownTemplateWorktree,
} from "@/features/markdown/commands/markdownBlockCommands"
import { getMarkdownReferenceProjectPaths } from "@/features/markdown/commands/markdownReferenceCommands"
import { MARKDOWN_FILE_MENTION_PATH_PATTERN } from "@/features/markdown/extensions/markdownFileMentions"
import { getMarkdownPanelPosition } from "@/features/markdown/utils/markdownPanelPosition"
import type { FileMentionPanelState } from "./useMarkdownPanels"

export interface ResolveContextDirectoryParams {
  projectPathRef: MutableRefObject<string | undefined>
  worktreePathRef: MutableRefObject<string | undefined>
  worktreesRef: MutableRefObject<GitWorktreeEntry[] | null | undefined>
  projectBranchRef: MutableRefObject<string | null | undefined>
}

/**
 * 解析光标处的 git 工作区上下文目录：
 * 1. 处于 supple 补充块内且单独绑定时，优先使用 supple 块结束行 {wt:} 的工作区；
 * 2. supple 未绑定但处于 &&& 模板块内时，继承 &&& 模板块结束行 {wt:} 的工作区；
 * 3. 否则取全局 worktreePath ?? projectPath；无 git 上下文（virtual 项目）返回 null。
 */
export const resolveContextDirectory = (
  view: EditorView,
  params: ResolveContextDirectoryParams,
): { directory: string; worktreeName: string } | null => {
  const projectPath = params.projectPathRef.current
  const worktrees = params.worktreesRef.current
  const cursor = view.state.selection.main.head
  const docText = view.state.doc.toString()

  // 1. 检查是否在 supple 补充块内并存在单独绑定的工作区
  const suppleEndLine = getMarkdownSuppleBlockEndLine(docText, cursor)
  if (suppleEndLine !== null) {
    const suppleBranch = getMarkdownSuppleWorktree(view.state.doc.line(suppleEndLine).text)
    if (suppleBranch) {
      const entry = worktrees?.find((item) => item.branch === suppleBranch)
      if (entry) {
        return { directory: entry.path, worktreeName: getGitWorktreeDisplayName(entry) }
      }
    }
  }

  // 2. 模板块局部绑定（或 supple 块继承外层 &&& 块）：当前模板块结束行带 {wt:分支名} 时，解析为该工作区路径。
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

  // 3. 全局绑定：worktreePath ?? projectPath。
  const directory = params.worktreePathRef.current ?? projectPath
  if (!directory) return null

  const entry = worktrees?.find((item) => item.path === directory)
  const worktreeName =
    entry?.branch ?? params.projectBranchRef.current ?? getGitWorktreeDirName(directory)
  return { directory, worktreeName }
}

export interface SyncFileMentionContext {
  onSearchFilesRef: MutableRefObject<((projectId: string, query: string) => Promise<ProjectFileEntry[]>) | undefined>
  onSearchReferencedFilesRef: MutableRefObject<((projectPaths: string[], query: string) => Promise<ReferencedProjectFileEntry[]>) | undefined>
  onSearchDirectoryFilesRef: MutableRefObject<((directory: string, query: string) => Promise<ProjectFileEntry[]>) | undefined>
  projectIdRef: MutableRefObject<string | undefined>
  projectPathRef: MutableRefObject<string | undefined>
  worktreePathRef: MutableRefObject<string | undefined>
  worktreesRef: MutableRefObject<GitWorktreeEntry[] | null | undefined>
  projectBranchRef: MutableRefObject<string | null | undefined>
  referencedProjectPathsRef: MutableRefObject<string[]>
  fileSearchRequestRef: MutableRefObject<number>
  fileMentionPanelRef: MutableRefObject<FileMentionPanelState | null>
  activeFileMentionIndexRef: MutableRefObject<number>
  setFileMentionPanel: (panel: FileMentionPanelState | null) => void
  setActiveFileMentionIndex: (index: number) => void
  closeFileMentionPanel: () => void
}

/**
 * 根据光标前的 @ 查询同步项目文件提及面板。
 */
export const syncFileMentionPanelHelper = (
  view: EditorView,
  ctx: SyncFileMentionContext,
): void => {
  const searchFiles = ctx.onSearchFilesRef.current
  const searchReferencedFiles = ctx.onSearchReferencedFilesRef.current
  const searchDirectoryFiles = ctx.onSearchDirectoryFilesRef.current
  const activeProjectId = ctx.projectIdRef.current
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
      ...ctx.referencedProjectPathsRef.current,
      ...getMarkdownReferenceProjectPaths(templateBlockContent ?? docText),
    ]),
  ]
  const context = resolveContextDirectory(view, {
    projectPathRef: ctx.projectPathRef,
    worktreePathRef: ctx.worktreePathRef,
    worktreesRef: ctx.worktreesRef,
    projectBranchRef: ctx.projectBranchRef,
  })
  const canSearchCurrentProject = Boolean(
    context && (searchDirectoryFiles || (searchFiles && activeProjectId)),
  )
  const canSearchReferencedProjects = Boolean(
    searchReferencedFiles && searchProjectPaths.length > 0,
  )

  if (!match || (!canSearchCurrentProject && !canSearchReferencedProjects)) {
    ctx.closeFileMentionPanel()
    return
  }

  const coords = view.coordsAtPos(cursor)
  if (!coords) {
    ctx.closeFileMentionPanel()
    return
  }

  const requestId = ctx.fileSearchRequestRef.current + 1
  ctx.fileSearchRequestRef.current = requestId
  const query = match[2] ?? ""
  const start = cursor - query.length - 1

  const currentProjectSearch = canSearchCurrentProject
    ? (context!.directory === ctx.projectPathRef.current && searchFiles && activeProjectId
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
    .then(([currentFiles, referencedFiles]) => {
      if (ctx.fileSearchRequestRef.current !== requestId) return

      const files = [...currentFiles, ...referencedFiles]
      if (files.length === 0) {
        ctx.closeFileMentionPanel()
        return
      }

      const position = getMarkdownPanelPosition("file", coords)
      const nextPanel = { files, position, start }
      ctx.fileMentionPanelRef.current = nextPanel
      ctx.activeFileMentionIndexRef.current = 0
      ctx.setFileMentionPanel(nextPanel)
      ctx.setActiveFileMentionIndex(0)
    })
    .catch((error) => {
      console.error("Failed to search markdown mention files", error)
      if (ctx.fileSearchRequestRef.current === requestId) {
        ctx.closeFileMentionPanel()
      }
    })
}
