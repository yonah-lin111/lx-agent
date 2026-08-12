import { GitStatusBar } from "@/features/git"

// 状态栏属性。
interface MarkdownStatusBarProps {
  // 当前项目文件系统路径；virtual 项目或缺省时不渲染状态栏。
  projectPath?: string
}

/**
 * 渲染编辑器底部状态栏。
 */
export const MarkdownStatusBar = ({
  projectPath,
}: MarkdownStatusBarProps): React.JSX.Element | null => {
  return <GitStatusBar projectPath={projectPath} />
}
