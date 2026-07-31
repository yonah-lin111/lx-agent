// 设计状态。
export type DesignStatus = "todo" | "in_progress" | "completed"

// 项目共享文件夹引用。
export type ReferencedFolder = { path: string; createdAt: string }

// 项目数据。
export type Project = {
  id: string
  name: string
  type: "filesystem" | "virtual"
  path?: string
  referencedFolders: ReferencedFolder[]
  createdAt: string
  updatedAt: string
}

// 模块数据。
export type Module = {
  id: string
  projectId: string
  name: string
  createdAt: string
  updatedAt: string
}

// 设计数据。
export type Design = {
  id: string
  projectId: string
  moduleId?: string
  name: string
  designData: string
  status: DesignStatus
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// 项目创建参数。
export type CreateProjectInput = { name: string; type?: Project["type"]; path?: string }

// 项目更新参数。
export type UpdateProjectInput = Partial<CreateProjectInput> & {
  referencedFolders?: ReferencedFolder[]
}

// 项目文件提及候选项。
export type ProjectFileEntry = { path: string; isDirectory: boolean }

// 引用项目的文件搜索结果。
export type ReferencedProjectFileEntry = ProjectFileEntry & { projectPath: string }

// 模块创建参数。
export type CreateModuleInput = { projectId: string; name: string }

// 模块更新参数。
export type UpdateModuleInput = { name: string }

// 设计创建参数。
export type CreateDesignInput = {
  projectId: string
  moduleId?: string
  name: string
  designData?: string
}

// 设计更新参数。
export type UpdateDesignInput = { name?: string; designData?: string; status?: DesignStatus }

// 渲染进程可调用的项目 IPC 接口。
export interface ProjectApi {
  project: {
    projects: {
      list: () => Promise<Project[]>
      create: (input: CreateProjectInput) => Promise<Project>
      update: (id: string, input: UpdateProjectInput) => Promise<void>
      delete: (id: string) => Promise<void>
      selectDirectory: () => Promise<string | null>
      searchFiles: (projectId: string, query: string) => Promise<ProjectFileEntry[]>
      searchReferencedFiles: (
        projectPaths: string[],
        query: string,
      ) => Promise<ReferencedProjectFileEntry[]>
    }
    modules: {
      list: (projectId?: string) => Promise<Module[]>
      create: (input: CreateModuleInput) => Promise<Module>
      update: (id: string, input: UpdateModuleInput) => Promise<void>
      delete: (id: string) => Promise<void>
    }
    designs: {
      list: (projectId?: string) => Promise<Design[]>
      create: (input: CreateDesignInput) => Promise<Design>
      update: (id: string, input: UpdateDesignInput) => Promise<void>
      sort: (ids: string[]) => Promise<Design[]>
      delete: (id: string) => Promise<void>
    }
  }
}
