import { McpStatusButton } from "@/components/layout/McpStatusButton"
import { GitStatusBar } from "@/features/git"

// Agent 状态栏属性。
interface AgentStatusBarProps {
  // 当前会话的工具执行目录。
  projectPath?: string
}

/**
 * 渲染 Agent 当前会话的路径、分支与工作区状态，最右侧为 MCP 连接状态。
 *
 * 无 git 上下文（projectPath 缺省）时隐藏 git 部分，但保留等高位占位，
 * 避免输入框位置跳动（高度 = GitStatusBar 的 border-t 1px + py-1 8px + text-xs 行高 16px）。
 */
export const AgentStatusBar = ({ projectPath }: AgentStatusBarProps): React.JSX.Element => {
  return (
    <div className="flex min-w-0 items-center">
      <div className="min-w-0 flex-1">
        {projectPath ? (
          <GitStatusBar projectPath={projectPath} />
        ) : (
          <div aria-hidden className="h-[25px] shrink-0" />
        )}
      </div>
      <McpStatusButton />
    </div>
  )
}
