import type { EditorView } from "@codemirror/view"
import type { GitWorktreeEntry } from "@shared/contracts/git"
import { getGitWorktreeDirName, getGitWorktreeDisplayName } from "@/features/git"
import {
  getMarkdownSuppleBlockEndLine,
  getMarkdownSuppleWorktree,
  getMarkdownTemplateBlockEndLine,
  getMarkdownTemplateWorktree,
} from "@/features/markdown/commands/markdownBlockCommands"

/**
 * 解析光标处的 git 工作区上下文目录：
 * 1. 处于 supple 补充块内且单独绑定时，优先使用 supple 块结束行 {wt:} 的工作区；
 * 2. supple 未绑定但处于 &&& 模板块内时，继承 &&& 模板块结束行 {wt:} 的工作区；
 * 3. 否则取全局 worktreePath ?? projectPath；无 git 上下文（virtual 项目）返回 null。
 */
export const resolveMarkdownContextDirectory = (
  view: EditorView,
  {
    projectPath,
    worktreePath,
    worktrees,
    projectBranch,
  }: {
    projectPath?: string
    worktreePath?: string
    worktrees?: GitWorktreeEntry[] | null
    projectBranch?: string | null
  },
): { directory: string; worktreeName: string } | null => {
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
  const directory = worktreePath ?? projectPath
  if (!directory) return null

  const entry = worktrees?.find((item) => item.path === directory)
  const worktreeName = entry?.branch ?? projectBranch ?? getGitWorktreeDirName(directory)
  return { directory, worktreeName }
}
