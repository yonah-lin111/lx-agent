import type { Project, ProjectFolder, ProjectItem } from "@shared/project"
import type {
  ProjectNavigationFilterScope,
  ProjectNavigationFolder,
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
): ProjectNavigationProject[] => {
  const buildFolderTree = (folder: ProjectFolder): ProjectNavigationFolder => ({
    id: folder.id,
    name: folder.name,
    parentFolderId: folder.parentFolderId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    projectFolders: folderRecords
      .filter((child) => child.parentFolderId === folder.id)
      .map(buildFolderTree),
    prompts: itemRecords
      .filter((item) => item.projectFolderId === folder.id)
      .map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
  })

  return projectRecords.map((project) => ({
    id: project.id,
    name: project.name,
    path: project.path,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    projectFolders: folderRecords
      .filter((folder) => folder.projectId === project.id && !folder.parentFolderId)
      .map(buildFolderTree),
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
}

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
): ProjectNavigationProject[] => {
  const sortFolderNode = (folder: ProjectNavigationFolder): ProjectNavigationFolder => ({
    ...folder,
    projectFolders: [...folder.projectFolders]
      .sort((left, right) => compareBySortKey(left, right, sortKey, direction))
      .map(sortFolderNode),
    prompts: sortPrompts(folder.prompts, sortKey, direction),
  })

  return [...projects]
    .sort((left, right) => compareBySortKey(left, right, sortKey, direction))
    .map((project) => ({
      ...project,
      projectFolders: [...project.projectFolders]
        .sort((left, right) => compareBySortKey(left, right, sortKey, direction))
        .map(sortFolderNode),
      prompts: sortPrompts(project.prompts, sortKey, direction),
    }))
}

/**
 * 根据关键词过滤项目树，同时保留匹配节点的父级层次。
 */
export const filterProjectNavigationTree = (
  projects: ProjectNavigationProject[],
  searchKeyword: string,
): ProjectNavigationProject[] => {
  const keyword = searchKeyword.trim().toLowerCase()
  if (!keyword) return projects

  const filterFolderNode = (
    folder: ProjectNavigationFolder,
    parentMatched: boolean,
  ): ProjectNavigationFolder | null => {
    const isFolderMatched = parentMatched || folder.name.toLowerCase().includes(keyword)
    const filteredChildFolders = folder.projectFolders
      .map((child) => filterFolderNode(child, isFolderMatched))
      .filter((child): child is ProjectNavigationFolder => child !== null)
    const filteredPrompts = folder.prompts.filter(
      (prompt) => isFolderMatched || prompt.name.toLowerCase().includes(keyword),
    )

    if (isFolderMatched || filteredChildFolders.length > 0 || filteredPrompts.length > 0) {
      return {
        ...folder,
        projectFolders: filteredChildFolders,
        prompts: filteredPrompts,
      }
    }
    return null
  }

  return projects.flatMap((project) => {
    const isProjectMatched = project.name.toLowerCase().includes(keyword)
    const folders = project.projectFolders
      .map((folder) => filterFolderNode(folder, isProjectMatched))
      .filter((folder): folder is ProjectNavigationFolder => folder !== null)
    const prompts = project.prompts.filter(
      (prompt) => isProjectMatched || prompt.name.toLowerCase().includes(keyword),
    )

    return isProjectMatched || folders.length > 0 || prompts.length > 0
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

  const filterFolderByStatus = (
    folder: ProjectNavigationFolder,
  ): ProjectNavigationFolder | null => {
    const filteredChildFolders = folder.projectFolders
      .map(filterFolderByStatus)
      .filter((child): child is ProjectNavigationFolder => child !== null)
    const filteredPrompts = folder.prompts.filter((prompt) => statuses.includes(prompt.status))

    if (filteredChildFolders.length > 0 || filteredPrompts.length > 0) {
      return {
        ...folder,
        projectFolders: filteredChildFolders,
        prompts: filteredPrompts,
      }
    }
    return null
  }

  return projects.flatMap((project) => {
    if (scope !== "all" && activeProjectId && project.id !== activeProjectId) return []
    const projectFolders = project.projectFolders
      .map(filterFolderByStatus)
      .filter((folder): folder is ProjectNavigationFolder => folder !== null)
    const prompts = project.prompts.filter((prompt) => statuses.includes(prompt.status))

    return projectFolders.length > 0 || prompts.length > 0
      ? [{ ...project, projectFolders, prompts }]
      : []
  })
}
