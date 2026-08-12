import { Folder, GitBranch } from "lucide-react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useGitStatus } from "@/features/markdown/hooks/useGitStatus"

// 状态栏属性。
interface MarkdownStatusBarProps {
  // 当前项目文件系统路径；virtual 项目或缺省时不渲染状态栏。
  projectPath?: string
}

// 变更计数展示段。
const CHANGE_SEGMENTS: {
  key: "staged" | "unstaged" | "untracked"
  label: string
  className: string
}[] = [
  { key: "staged", label: "+", className: "text-emerald-400" },
  { key: "unstaged", label: "~", className: "text-amber-400" },
  { key: "untracked", label: "?", className: "text-sky-400" },
]

/**
 * 渲染编辑器底部状态栏：左侧为当前项目路径，路径后以 `:分支(+N ~N ?N)` 展示
 * git 分支与工作区变更分类计数；非 git 目录仅显示路径，virtual 项目整体隐藏。
 */
export const MarkdownStatusBar = ({
  projectPath,
}: MarkdownStatusBarProps): React.JSX.Element | null => {
  const status = useGitStatus(projectPath)
  if (!projectPath) return null

  return (
    <div className="flex min-w-0 items-center gap-2 border-t border-white/5 px-3 py-1 text-xs text-white/50">
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
            <span key={segment.key} className={`shrink-0 tabular-nums ${segment.className}`}>
              {segment.label}
              {status.changes[segment.key]}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}
