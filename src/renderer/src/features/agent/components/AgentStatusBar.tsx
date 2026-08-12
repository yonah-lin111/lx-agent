import { GitStatusBar } from "@/features/git"

// Agent 状态栏属性。
interface AgentStatusBarProps {
  // 当前会话的工具执行目录。
  projectPath?: string
}

/**
 * 渲染 Agent 当前会话的路径、分支与工作区变更状态。
 */
export const AgentStatusBar = ({ projectPath }: AgentStatusBarProps): React.JSX.Element | null => (
  <GitStatusBar projectPath={projectPath} />
)
