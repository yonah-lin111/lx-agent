import { Folder, GitBranch } from "lucide-react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useGitStatus } from "@/features/git/hooks/useGitStatus"

// 状态栏属性。
interface GitStatusBarProps {
  // 当前项目文件系统路径；缺省时不渲染状态栏。
  projectPath?: string
}

// 变更计数展示段。
const CHANGE_SEGMENTS: {
  key: "staged" | "unstaged" | "untracked"
  label: string
  className: string
  tooltip: string
}[] = [
  { key: "staged", label: "+", className: "text-emerald-400", tooltip: "已暂存变更" },
  { key: "unstaged", label: "~", className: "text-amber-400", tooltip: "未暂存变更" },
  { key: "untracked", label: "?", className: "text-sky-400", tooltip: "未跟踪文件" },
]

/**
 * 渲染路径、git 分支与工作区变更分类计数；非 git 目录仅显示路径。
 */
export const GitStatusBar = ({ projectPath }: GitStatusBarProps): React.JSX.Element | null => {
  const status = useGitStatus(projectPath)
  if (!projectPath) return null

  return (
    <div className="flex min-w-0 items-center gap-2 border-t border-white/5 py-1 text-xs text-white/50">
      <LxTooltip content={projectPath} placement="top" contentClassName="max-w-[24rem]">
        <span className="flex min-w-0 items-center gap-1">
          <Folder className="h-3 w-3 shrink-0" />
          <span className="truncate">{projectPath}</span>
        </span>
      </LxTooltip>
      {status && (
        <span className="flex min-w-0 items-center gap-2">
          <LxTooltip content={`当前分支 ${status.branch}`} placement="top">
            <span className="flex shrink-0 items-center gap-1 text-white/70">
              <GitBranch className="h-3 w-3" />: {status.branch}
            </span>
          </LxTooltip>
          {CHANGE_SEGMENTS.filter((segment) => status.changes[segment.key] > 0).map((segment) => (
            <LxTooltip
              key={segment.key}
              content={`${segment.tooltip} ${status.changes[segment.key]}`}
              placement="top"
            >
              <span className={`shrink-0 tabular-nums ${segment.className}`}>
                {segment.label}
                {status.changes[segment.key]}
              </span>
            </LxTooltip>
          ))}
        </span>
      )}
    </div>
  )
}
