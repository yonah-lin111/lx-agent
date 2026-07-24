import type {
  CreateDesignInput,
  CreateModuleInput,
  CreateProjectInput,
  Design,
  Module,
  Project,
  UpdateDesignInput,
  UpdateModuleInput,
  UpdateProjectInput,
} from "@shared/project"

/**
 * 隔离项目导航对 Electron preload API 的依赖。
 */
export const projectNavigationApi = {
  listProjects: (): Promise<Project[]> => window.api.project.projects.list(),
  listModules: (): Promise<Module[]> => window.api.project.modules.list(),
  listDesigns: (): Promise<Design[]> => window.api.project.designs.list(),
  createProject: (input: CreateProjectInput): Promise<Project> =>
    window.api.project.projects.create(input),
  updateProject: (id: string, input: UpdateProjectInput): Promise<void> =>
    window.api.project.projects.update(id, input),
  deleteProject: (id: string): Promise<void> => window.api.project.projects.delete(id),
  createModule: (input: CreateModuleInput): Promise<Module> =>
    window.api.project.modules.create(input),
  updateModule: (id: string, input: UpdateModuleInput): Promise<void> =>
    window.api.project.modules.update(id, input),
  deleteModule: (id: string): Promise<void> => window.api.project.modules.delete(id),
  createDesign: (input: CreateDesignInput): Promise<Design> =>
    window.api.project.designs.create(input),
  updateDesign: (id: string, input: UpdateDesignInput): Promise<void> =>
    window.api.project.designs.update(id, input),
  sortDesigns: (ids: string[]): Promise<Design[]> => window.api.project.designs.sort(ids),
  deleteDesign: (id: string): Promise<void> => window.api.project.designs.delete(id),
}
