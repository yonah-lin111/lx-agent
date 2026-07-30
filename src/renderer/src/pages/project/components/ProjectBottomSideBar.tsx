interface ProjectBottomSideBarProps {
  isExpanded?: boolean
}

/**
 * 渲染项目页面专属底部栏内容。
 */
export const ProjectBottomSideBar = ({
  isExpanded,
}: ProjectBottomSideBarProps): React.JSX.Element | null => {
  if (!isExpanded) return null
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-white/60">
      hello world
    </div>
  )
}
