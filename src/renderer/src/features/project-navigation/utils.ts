import type { Design, Module, Project } from "@shared/project"
import type { ProjectNavigationProject } from "@/features/project-navigation/types"

/**
 * 将持久化记录组装为项目导航所需的树形数据。
 */
export const createProjectNavigationTree = (
  projectRecords: Project[],
  moduleRecords: Module[],
  designRecords: Design[],
): ProjectNavigationProject[] =>
  projectRecords.map((project) => ({
    id: project.id,
    name: project.name,
    path: project.path,
    modules: moduleRecords
      .filter((module) => module.projectId === project.id)
      .map((module) => ({
        id: module.id,
        name: module.name,
        prompts: designRecords
          .filter((design) => design.moduleId === module.id)
          .map((design) => ({ id: design.id, name: design.name, status: design.status })),
      })),
    prompts: designRecords
      .filter((design) => design.projectId === project.id && !design.moduleId)
      .map((design) => ({ id: design.id, name: design.name, status: design.status })),
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
    const modules = project.modules
      .map((module) => ({
        ...module,
        prompts: module.prompts.filter((prompt) => prompt.name.toLowerCase().includes(keyword)),
      }))
      .filter(
        (module) =>
          matchesProject ||
          module.name.toLowerCase().includes(keyword) ||
          module.prompts.length > 0,
      )
    const prompts = project.prompts.filter((prompt) => prompt.name.toLowerCase().includes(keyword))
    return matchesProject || modules.length > 0 || prompts.length > 0
      ? [{ ...project, modules, prompts }]
      : []
  })
}
