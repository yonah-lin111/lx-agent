import { GitStatusBar } from "@/features/git"

// Agent 状态栏属性。
interface AgentStatusBarProps {
  // 当前会话的工具执行目录。
  projectPath?: string
}

/**
 * 渲染 Agent 当前会话的路径、分支与工作区变更状态。
 *
 * 无 git 上下文（projectPath 缺省）时隐藏状态栏，但保留等高位占位，
 * 避免输入框位置跳动（高度 = GitStatusBar 的 border-t 1px + py-1 8px + text-xs 行高 16px）。
 */
export const AgentStatusBar = ({ projectPath }: AgentStatusBarProps): React.JSX.Element => {
  if (!projectPath) {
    return <div aria-hidden className="h-[25px] shrink-0" />
  }
  return <GitStatusBar projectPath={projectPath} />
}
