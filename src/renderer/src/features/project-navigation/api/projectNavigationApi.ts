import type {
  CreateProjectFolderInput,
  CreateProjectInput,
  CreateProjectItemInput,
  Project,
  ProjectFolder,
  ProjectItem,
  UpdateProjectFolderInput,
  UpdateProjectInput,
  UpdateProjectItemInput,
} from "@shared/project"

/**
 * 隔离项目导航对 Electron preload API 的依赖。
 */
export const projectNavigationApi = {
  listProjects: (): Promise<Project[]> => window.api.project.projects.list(),
  listFolders: (): Promise<ProjectFolder[]> => window.api.project.folders.list(),
  listItems: (): Promise<ProjectItem[]> => window.api.project.items.list(),
  createProject: (input: CreateProjectInput): Promise<Project> =>
    window.api.project.projects.create(input),
  updateProject: (id: string, input: UpdateProjectInput): Promise<void> =>
    window.api.project.projects.update(id, input),
  deleteProject: (id: string): Promise<void> => window.api.project.projects.delete(id),
  selectProjectDirectory: (): Promise<string | null> =>
    window.api.project.projects.selectDirectory(),
  createFolder: (input: CreateProjectFolderInput): Promise<ProjectFolder> =>
    window.api.project.folders.create(input),
  updateFolder: (id: string, input: UpdateProjectFolderInput): Promise<void> =>
    window.api.project.folders.update(id, input),
  deleteFolder: (id: string): Promise<void> => window.api.project.folders.delete(id),
  createItem: (input: CreateProjectItemInput): Promise<ProjectItem> =>
    window.api.project.items.create(input),
  updateItem: (id: string, input: UpdateProjectItemInput): Promise<void> =>
    window.api.project.items.update(id, input),
  deleteItem: (id: string): Promise<void> => window.api.project.items.delete(id),
}
