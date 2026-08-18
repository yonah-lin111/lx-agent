import { GitStatusBar } from "@/features/git"
import { ProjectReferencedFolderTags } from "@/features/project"

// 状态栏属性。
interface MarkdownStatusBarProps {
  // 当前项目文件系统路径；virtual 项目或缺省时不渲染状态栏。
  projectPath?: string
}

/**
 * 渲染编辑器底部状态栏：左侧为 Git 状态与工作区（禁止被压缩/覆盖），右侧为项目共享文件夹引用标签（自适应宽度并右对齐）。
 */
export const MarkdownStatusBar = ({
  projectPath,
}: MarkdownStatusBarProps): React.JSX.Element | null => {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-t border-white/5 py-1 text-xs text-white/50">
      {/* 左侧：项目路径、分支与工作区（固定不被压缩覆盖） */}
      <div className="flex min-w-0 shrink-0 items-center">
        <GitStatusBar
          className="flex min-w-0 items-center gap-2 text-xs text-white/50"
          projectPath={projectPath}
        />
      </div>

      {/* 右侧：项目共享文件夹引用标签栏（自适应空间，内部滚动，右对齐） */}
      <div className="flex min-w-0 flex-1 shrink items-center justify-end overflow-hidden">
        <ProjectReferencedFolderTags />
      </div>
    </div>
  )
}
