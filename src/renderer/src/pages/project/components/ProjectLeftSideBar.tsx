import { ProjectNavigation } from "@/features/project-navigation"

interface ProjectLeftSideBarProps {
  isCollapsed?: boolean
}

/**
 * 渲染设计页面专属左侧栏内容。
 */
export const ProjectLeftSideBar = ({
  isCollapsed,
}: ProjectLeftSideBarProps): React.JSX.Element | null => {
  if (isCollapsed) return null
  return <ProjectNavigation />
}
