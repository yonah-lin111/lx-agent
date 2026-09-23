import type { EditorView } from "@codemirror/view"
import type { RefObject } from "react"
import { useRef, useState } from "react"
import { getMarkdownPanelPosition } from "@/components/ui/LxMarkdown/utils/markdownPanelPosition"
import { buildGitWorktreeOptions, type GitWorktreeOption } from "@/features/git"
import { getMarkdownSlashCommandLine } from "@/features/markdown/commands/markdownSlashCommands"
import type {
  GitWorktreePanelState,
  MarkdownPanelsContextRefs,
} from "@/features/markdown/hooks/useMarkdownPanels.types"
import { resolveMarkdownContextDirectory } from "@/features/markdown/utils/markdownContextDirectory"

/**
 * git 工作区选择面板：二级面板的状态、打开、回显与键盘导航。
 */
export const useMarkdownGitWorktreePanel = ({
  editorViewRef,
  context,
}: {
  editorViewRef: RefObject<EditorView | null>
  context: Pick<
    MarkdownPanelsContextRefs,
    | "projectPathRef"
    | "worktreePathRef"
    | "worktreesRef"
    | "projectBranchRef"
    | "reloadWorktreesRef"
  >
}) => {
  const { projectPathRef, worktreePathRef, worktreesRef, projectBranchRef, reloadWorktreesRef } =
    context
  const gitWorktreePanelRef = useRef<GitWorktreePanelState | null>(null)
  const activeGitWorktreeIndexRef = useRef(0)
  const [gitWorktreePanel, setGitWorktreePanel] = useState<GitWorktreePanelState | null>(null)
  const [activeGitWorktreeIndex, setActiveGitWorktreeIndex] = useState(0)

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

    const context = resolveMarkdownContextDirectory(view, {
      projectPath,
      worktreePath: worktreePathRef.current,
      worktrees,
      projectBranch: projectBranchRef.current,
    })
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

  return {
    gitWorktreePanel,
    activeGitWorktreeIndex,
    gitWorktreePanelRef,
    activeGitWorktreeIndexRef,
    closeGitWorktreePanel,
    openGitWorktreePanel,
    selectGitWorktree,
    handleGitWorktreeKey,
  }
}
