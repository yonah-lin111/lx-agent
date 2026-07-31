import type { Design, Project, UpdateDesignInput, UpdateProjectInput } from "@shared/project"

/**
 * 隔离设计编辑器对 Electron preload API 的依赖。
 */
export const projectApi = {
  list: (): Promise<Design[]> => window.api.project.designs.list(),
  listProjects: (): Promise<Project[]> => window.api.project.projects.list(),
  updateProject: (id: string, input: UpdateProjectInput): Promise<void> =>
    window.api.project.projects.update(id, input),
  update: (id: string, input: UpdateDesignInput): Promise<void> =>
    window.api.project.designs.update(id, input),
  searchFiles: (projectId: string, query: string) =>
    window.api.project.projects.searchFiles(projectId, query),
  searchReferencedFiles: (projectPaths: string[], query: string) =>
    window.api.project.projects.searchReferencedFiles(projectPaths, query),
}
