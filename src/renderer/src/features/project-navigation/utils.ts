import type { Project, ProjectFolder, ProjectItem } from "@shared/project"
import type {
  ProjectNavigationFilterScope,
  ProjectNavigationProject,
  ProjectNavigationPrompt,
  ProjectNavigationSortDirection,
  ProjectNavigationSortKey,
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
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    projectFolders: folderRecords
      .filter((folder) => folder.projectId === project.id)
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
        prompts: itemRecords
          .filter((item) => item.projectFolderId === folder.id)
          .map((item) => ({
            id: item.id,
            name: item.name,
            status: item.status,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })),
      })),
    prompts: itemRecords
      .filter((item) => item.projectId === project.id && !item.projectFolderId)
      .map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
  }))

/**
 * 按指定键与方向比较两个同名同字段节点。
 */
const compareBySortKey = (
  left: { name: string; createdAt: string; updatedAt: string },
  right: { name: string; createdAt: string; updatedAt: string },
  sortKey: ProjectNavigationSortKey,
  direction: ProjectNavigationSortDirection,
): number => {
  const result = left[sortKey].localeCompare(right[sortKey], "zh-Hans-CN")
  return direction === "asc" ? result : -result
}

/**
 * 排序条目：未完成/进行中在前，已完成置底；组内按排序键排列。
 */
const sortPrompts = (
  prompts: ProjectNavigationPrompt[],
  sortKey: ProjectNavigationSortKey,
  direction: ProjectNavigationSortDirection,
): ProjectNavigationPrompt[] => {
  const statusOrder = (prompt: ProjectNavigationPrompt): number =>
    prompt.status === "completed" ? 1 : 0

  return [...prompts].sort(
    (left, right) =>
      statusOrder(left) - statusOrder(right) || compareBySortKey(left, right, sortKey, direction),
  )
}

/**
 * 按当前排序键与方向重排项目树：项目、文件夹按键排序，条目在状态分组后按键排序。
 */
export const sortProjectNavigationTree = (
  projects: ProjectNavigationProject[],
  sortKey: ProjectNavigationSortKey,
  direction: ProjectNavigationSortDirection,
): ProjectNavigationProject[] =>
  [...projects]
    .sort((left, right) => compareBySortKey(left, right, sortKey, direction))
    .map((project) => ({
      ...project,
      projectFolders: [...project.projectFolders]
        .sort((left, right) => compareBySortKey(left, right, sortKey, direction))
        .map((folder) => ({
          ...folder,
          prompts: sortPrompts(folder.prompts, sortKey, direction),
        })),
      prompts: sortPrompts(project.prompts, sortKey, direction),
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
