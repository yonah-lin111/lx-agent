import type { TodoList } from "@shared/contracts/agent"
import { Layers } from "lucide-react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { TodoStatusButton } from "@/features/agent/components/TodoStatusButton"
import { GitStatusBar } from "@/features/git"

// Agent 状态栏属性。
interface AgentStatusBarProps {
  // 当前会话的工具执行目录。
  projectPath?: string
  // 当前会话上下文容量（估计 token / 压缩窗口；null = 尚无会话数据）。
  contextUsage?: { tokens: number; contextWindow: number } | null
  // 当前会话任务清单（有未完成任务时状态栏右侧展示 todo 计数 icon）。
  todos?: TodoList
}

// 上下文容量文字颜色：≥100% 红（已满）/ >85% 琥珀（接近压缩触发区）/ 其余中性。
const contextColor = (percent: number): string => {
  if (percent >= 100) return "text-red-400"
  if (percent > 85) return "text-amber-400"
  return "text-white/50"
}

/**
 * 渲染 Agent 当前会话的路径、分支、上下文容量与任务清单状态，最右侧为 todo 计数。
 *
 * 无 git 上下文（projectPath 缺省）时隐藏 git 部分，但保留等高位占位，
 * 避免输入框位置跳动（高度 = GitStatusBar 的 border-t 1px + py-1 8px + text-xs 行高 16px）。
 */
export const AgentStatusBar = ({
  projectPath,
  contextUsage,
  todos,
}: AgentStatusBarProps): React.JSX.Element => {
  const percent = contextUsage
    ? Math.min(100, Math.round((contextUsage.tokens / contextUsage.contextWindow) * 100))
    : null

  return (
    <div className="flex min-w-0 items-center">
      <div className="min-w-0 flex-1">
        {projectPath ? (
          <GitStatusBar projectPath={projectPath} />
        ) : (
          <div aria-hidden className="h-[25px] shrink-0" />
        )}
      </div>
      {contextUsage && percent !== null && (
        <LxTooltip
          placement="top"
          content={`已用 ${contextUsage.tokens.toLocaleString()} / ${contextUsage.contextWindow.toLocaleString()} tokens`}
        >
          <span
            aria-label="上下文容量"
            className={`flex shrink-0 cursor-default items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-xs transition-colors hover:bg-white/5 ${contextColor(percent)}`}
          >
            <Layers className="h-3 w-3 shrink-0" />
            <span className="tabular-nums">{percent}%</span>
          </span>
        </LxTooltip>
      )}
      <TodoStatusButton todos={todos} />
    </div>
  )
}
