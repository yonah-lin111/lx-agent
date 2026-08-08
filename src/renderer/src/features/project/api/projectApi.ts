import type {
  Project,
  ProjectFolder,
  ProjectItem,
  UpdateProjectInput,
  UpdateProjectItemInput,
} from "@shared/project"

/**
 * 隔离项目条目编辑器对 Electron preload API 的依赖。
 */
export const projectApi = {
  list: (): Promise<ProjectItem[]> => window.api.project.items.list(),
  listProjects: (): Promise<Project[]> => window.api.project.projects.list(),
  listFolders: (): Promise<ProjectFolder[]> => window.api.project.folders.list(),
  updateProject: (id: string, input: UpdateProjectInput): Promise<void> =>
    window.api.project.projects.update(id, input),
  update: (id: string, input: UpdateProjectItemInput): Promise<void> =>
    window.api.project.items.update(id, input),
  selectDirectory: (): Promise<string | null> => window.api.project.projects.selectDirectory(),
  searchFiles: (projectId: string, query: string) =>
    window.api.project.projects.searchFiles(projectId, query),
  searchReferencedFiles: (projectPaths: string[], query: string) =>
    window.api.project.projects.searchReferencedFiles(projectPaths, query),
}
