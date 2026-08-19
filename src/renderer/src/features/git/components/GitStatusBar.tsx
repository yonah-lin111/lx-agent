import { Folder, GitBranch, GitFork } from "lucide-react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useGitWorktrees } from "@/features/git/hooks/useGitWorktrees"
import { getGitWorktreeDirName } from "@/features/git/utils"

// 状态栏属性。
interface GitStatusBarProps {
  // 当前项目文件系统路径；缺省时不渲染状态栏。
  projectPath?: string
  // 容器类名。
  className?: string
}

/**
 * 渲染项目名、git 分支与工作区；非 git 目录仅显示项目名。
 *
 * 项目名取仓库根目录名（切换工作区后保持不变）；处于非默认工作区时
 * 单独展示工作区段（GitFork 图标 + 工作区名）。
 */
export const GitStatusBar = ({
  projectPath,
  className = "flex min-w-0 items-center gap-2 border-t border-white/5 py-1 text-xs text-white/50",
}: GitStatusBarProps): React.JSX.Element | null => {
  const { worktrees, projectBranch } = useGitWorktrees(projectPath)
  if (!projectPath) return null

  const defaultEntry = (worktrees ?? []).find((entry) => entry.isDefault)
  const projectName = defaultEntry
    ? getGitWorktreeDirName(defaultEntry.path)
    : getGitWorktreeDirName(projectPath)

  // 当前目录所在的工作区：精确命中优先；仓库内子目录（含 .worktrees 内部）取最长路径前缀命中。
  const currentEntry = (worktrees ?? [])
    .filter((entry) => entry.path === projectPath || projectPath.startsWith(`${entry.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]
  const worktreeName =
    currentEntry && !currentEntry.isDefault ? getGitWorktreeDirName(currentEntry.path) : undefined

  // 分支名恒取主工作区（仓库根）分支。
  const mainBranch = defaultEntry?.branch ?? projectBranch

  return (
    <div className={className}>
      <LxTooltip content={projectPath} placement="top">
        <span className="flex min-w-0 items-center gap-1">
          <Folder className="h-3.5 w-3.5 shrink-0 text-sky-400" />
          <span className="truncate">: {projectName}</span>
        </span>
      </LxTooltip>
      {mainBranch && (
        <LxTooltip content={`当前分支 ${mainBranch}`} placement="top">
          <span className="flex shrink-0 items-center gap-1 text-white/70">
            <GitBranch className="h-3.5 w-3.5 text-emerald-400" />: {mainBranch}
          </span>
        </LxTooltip>
      )}
      {worktreeName && (
        <LxTooltip content={`工作区 ${worktreeName}`} placement="top">
          <span className="flex shrink-0 items-center gap-1 text-white/70">
            <GitFork className="h-3.5 w-3.5 text-amber-400" />: {worktreeName}
          </span>
        </LxTooltip>
      )}
    </div>
  )
}
