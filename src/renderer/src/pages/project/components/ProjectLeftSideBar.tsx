import { LeftSideBar } from "@/components/layout/LeftSideBar"
import { ProjectNavigation } from "@/features/project-navigation"

/**
 * 渲染设计页面专属左侧栏。
 */
export const ProjectLeftSideBar = (): React.JSX.Element => {
  return (
    <LeftSideBar>
      <ProjectNavigation />
    </LeftSideBar>
  )
}
