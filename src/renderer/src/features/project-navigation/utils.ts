import type { Project, ProjectFolder, ProjectItem } from "@shared/project"
import type {
  ProjectNavigationFilterScope,
  ProjectNavigationProject,
  ProjectNavigationPrompt,
} from "@/features/project-navigation/types"

/**
 * 将持久化记录组装为项目导航所需的树形数据。
 */
export const createProjectNavigationTree = (
  projectRecords: Project[],
  folderRecords: ProjectFolder[],
  itemRecords: ProjectItem[],
): ProjectNavigationProject[] =>
  projectRecords.map((project) => ({
    id: project.id,
    name: project.name,
    path: project.path,
    projectFolders: folderRecords
      .filter((folder) => folder.projectId === project.id)
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        prompts: itemRecords
          .filter((item) => item.projectFolderId === folder.id)
          .map((item) => ({ id: item.id, name: item.name, status: item.status })),
      })),
    prompts: itemRecords
      .filter((item) => item.projectId === project.id && !item.projectFolderId)
      .map((item) => ({ id: item.id, name: item.name, status: item.status })),
  }))

/**
 * 根据关键词过滤项目树，同时保留匹配节点的父级层次。
 */
export const filterProjectNavigationTree = (
  projects: ProjectNavigationProject[],
  searchKeyword: string,
): ProjectNavigationProject[] => {
  const keyword = searchKeyword.trim().toLowerCase()
  if (!keyword) return projects
  return projects.flatMap((project) => {
    const matchesProject = project.name.toLowerCase().includes(keyword)
    const folders = project.projectFolders
      .map((folder) => ({
        ...folder,
        prompts: folder.prompts.filter((prompt) => prompt.name.toLowerCase().includes(keyword)),
      }))
      .filter(
        (folder) =>
          matchesProject ||
          folder.name.toLowerCase().includes(keyword) ||
          folder.prompts.length > 0,
      )
    const prompts = project.prompts.filter((prompt) => prompt.name.toLowerCase().includes(keyword))
    return matchesProject || folders.length > 0 || prompts.length > 0
      ? [{ ...project, projectFolders: folders, prompts }]
      : []
  })
}

/**
 * 根据条目状态过滤项目树，同时保留匹配条目的父级层级。
 * 范围限定为当前项目且存在当前条目时，仅保留该项目的匹配条目。
 */
export const filterProjectNavigationTreeByStatus = (
  projects: ProjectNavigationProject[],
  statuses: ProjectNavigationPrompt["status"][],
  scope: ProjectNavigationFilterScope,
  activeProjectId?: string,
): ProjectNavigationProject[] => {
  if (statuses.length === 0) return projects
  return projects.flatMap((project) => {
    if (scope !== "all" && activeProjectId && project.id !== activeProjectId) return []
    const projectFolders = project.projectFolders
      .map((folder) => ({
        ...folder,
        prompts: folder.prompts.filter((prompt) => statuses.includes(prompt.status)),
      }))
      .filter((folder) => folder.prompts.length > 0)
    const prompts = project.prompts.filter((prompt) => statuses.includes(prompt.status))
    return projectFolders.length > 0 || prompts.length > 0
      ? [{ ...project, projectFolders, prompts }]
      : []
  })
}
