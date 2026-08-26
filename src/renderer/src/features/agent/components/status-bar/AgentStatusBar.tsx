import type { JobSnapshot, PermissionRequest, TodoList } from "@shared/contracts/agent"
import { Layers } from "lucide-react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { GitStatusBar } from "@/features/git"
import { useTranslation } from "@/i18n"
import { JobStatusButton } from "./JobStatusButton"
import { PermissionStatusButton } from "./PermissionStatusButton"
import { TodoStatusButton } from "./TodoStatusButton"

// Agent 状态栏属性。
export interface AgentStatusBarProps {
  // 当前会话的工具执行目录。
  projectPath?: string
  // 当前会话绑定的项目 ID。
  projectId?: string
  // 路径切换提示目标（新会话切换页面/项目时触发）。
  pathPrompt?: { projectId?: string; projectPath: string; projectName?: string } | null
  // 确认切换路径回调。
  onAcceptPathPrompt?: () => void
  // 取消切换路径回调。
  onDismissPathPrompt?: () => void
  // 切换项目回调。
  onProjectChange?: (projectId: string, projectPath: string) => void
  // 切换分支回调。
  onBranchChange?: (branch: string) => void
  // 切换工作区回调。
  onWorktreeChange?: (worktreePath: string) => void
  // 当前会话上下文容量（估计 token / 压缩窗口；null = 尚无会话数据）。
  contextUsage?: { tokens: number; contextWindow: number } | null
  // 当前会话任务清单（有未完成任务时状态栏右侧展示 todo 计数 icon）。
  todos?: TodoList
  // 后台长任务列表。
  jobs?: JobSnapshot[]
  // 打开后台长任务监控面板。
  onOpenJobs?: () => void
  // 挂起的权限请求（非空时状态栏展示权限 icon 与常驻 tooltip）。
  pendingRequest: PermissionRequest | null
  // 权限决策回传（主进程挂起请求的内部语义；由 AgentPage 提供）。
  onPermissionRespond: (
    decision: "allow" | "deny",
    rememberForSession?: boolean,
    allowAll?: boolean,
    permanent?: boolean,
  ) => void
}

// 上下文容量文字颜色：≥100% 红（已满）/ >85% 琥珀（接近压缩触发区）/ 其余中性。
const contextColor = (percent: number): string => {
  if (percent >= 100) return "text-red-400"
  if (percent > 85) return "text-amber-400"
  return "text-white/50"
}

/**
 * 渲染 Agent 当前会话的路径、分支、上下文容量与任务清单状态，最右侧为 todo 计数与后台任务监控。
 *
 * 无 git 上下文（projectPath 缺省）时隐藏 git 部分，但保留等高位占位，
 * 避免输入框位置跳动（高度 = GitStatusBar 的 border-t 1px + py-1 8px + text-xs 行高 16px）。
 */
export const AgentStatusBar = ({
  projectPath,
  projectId,
  pathPrompt,
  onAcceptPathPrompt,
  onDismissPathPrompt,
  onProjectChange,
  onBranchChange,
  onWorktreeChange,
  contextUsage,
  todos,
  jobs,
  onOpenJobs,
  pendingRequest,
  onPermissionRespond,
}: AgentStatusBarProps): React.JSX.Element => {
  const { t } = useTranslation()
  const percent = contextUsage
    ? Math.min(100, Math.round((contextUsage.tokens / contextUsage.contextWindow) * 100))
    : null

  return (
    <div className="agent-status-bar flex min-w-0 items-center">
      <div className="min-w-0 flex-1">
        <GitStatusBar
          projectPath={projectPath}
          projectId={projectId}
          pathPrompt={pathPrompt}
          onAcceptPathPrompt={onAcceptPathPrompt}
          onDismissPathPrompt={onDismissPathPrompt}
          interactive={true}
          alwaysShowWorktree={true}
          onProjectChange={onProjectChange}
          onBranchChange={onBranchChange}
          onWorktreeChange={onWorktreeChange}
        />
      </div>
      {contextUsage && percent !== null && (
        <LxTooltip
          placement="top"
          content={t("agent.contextUsed", {
            used: contextUsage.tokens.toLocaleString(),
            total: contextUsage.contextWindow.toLocaleString(),
          })}
        >
          <span
            aria-label={t("agent.contextCapacity")}
            className={`agent-status-context-pill flex shrink-0 cursor-default items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-xs transition-colors hover:bg-white/5 ${contextColor(percent)}`}
          >
            <Layers className="h-3.5 w-3.5 shrink-0" />
            <span className="tabular-nums">{percent}%</span>
          </span>
        </LxTooltip>
      )}
      <JobStatusButton jobs={jobs ?? []} onOpenJobs={onOpenJobs} />
      <TodoStatusButton todos={todos} />
      <PermissionStatusButton request={pendingRequest} onRespond={onPermissionRespond} />
    </div>
  )
}
