import { ProjectRecentItemsTabs } from "@/pages/project/components/ProjectRecentItemsTabs"

// 项目页面顶部内容容器属性。
interface ProjectTopSideBarProps {
  isExpanded: boolean
}

/**
 * 项目页面头部内容容器：聚合头部各子组件，后续新增头部组件在此组合。
 */
export const ProjectTopSideBar = ({ isExpanded }: ProjectTopSideBarProps): React.JSX.Element => (
  <div className="flex h-full w-full flex-col">
    <ProjectRecentItemsTabs isExpanded={isExpanded} />
  </div>
)
