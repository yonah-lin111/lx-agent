interface HomeLeftSideBarProps {
  isCollapsed?: boolean
}

/**
 * 渲染主页专属左侧栏内容。
 */
export const HomeLeftSideBar = ({ isCollapsed }: HomeLeftSideBarProps): React.JSX.Element | null => {
  if (isCollapsed) return null
  return (
    <div className="flex h-full items-center justify-center text-sm text-white/60">主页侧边栏</div>
  )
}
