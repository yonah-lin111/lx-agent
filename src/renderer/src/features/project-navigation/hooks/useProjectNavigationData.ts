import { useCallback, useEffect, useState } from "react"
import { projectNavigationApi } from "@/features/project-navigation/api/projectNavigationApi"
import type { ProjectNavigationProject } from "@/features/project-navigation/types"
import { createProjectNavigationTree } from "@/features/project-navigation/utils"

/**
 * 加载并刷新项目导航所需的持久化项目树。
 */
export const useProjectNavigationData = (): {
  projects: ProjectNavigationProject[]
  refreshProjects: () => Promise<void>
} => {
  const [projects, setProjects] = useState<ProjectNavigationProject[]>([])

  const refreshProjects = useCallback(async (): Promise<void> => {
    const [projectRecords, folderRecords, itemRecords] = await Promise.all([
      projectNavigationApi.listProjects(),
      projectNavigationApi.listFolders(),
      projectNavigationApi.listItems(),
    ])
    setProjects(createProjectNavigationTree(projectRecords, folderRecords, itemRecords))
  }, [])

  useEffect(() => {
    void refreshProjects().catch((error: unknown) => console.error("Failed to load items", error))
  }, [refreshProjects])

  return { projects, refreshProjects }
}
