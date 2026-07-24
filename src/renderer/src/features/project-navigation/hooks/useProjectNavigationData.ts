import { useCallback, useEffect, useState } from "react"
import type { SidebarProject } from "@/features/project-navigation/components/ProjectNavigationList"
import { createProjectNavigationTree } from "@/features/project-navigation/utils"

/**
 * 加载并刷新项目导航所需的持久化项目树。
 */
export const useProjectNavigationData = (): {
  projects: SidebarProject[]
  refreshProjects: () => Promise<void>
} => {
  const [projects, setProjects] = useState<SidebarProject[]>([])

  const refreshProjects = useCallback(async (): Promise<void> => {
    const [projectRecords, moduleRecords, designRecords] = await Promise.all([
      window.api.project.projects.list(),
      window.api.project.modules.list(),
      window.api.project.designs.list(),
    ])
    setProjects(createProjectNavigationTree(projectRecords, moduleRecords, designRecords))
  }, [])

  useEffect(() => {
    void refreshProjects().catch((error: unknown) => console.error("Failed to load designs", error))
  }, [refreshProjects])

  return { projects, refreshProjects }
}
