// 项目条目状态。
export type ProjectItemStatus = "todo" | "in_progress" | "completed"

// 项目共享文件夹引用。enabled 表示该文件夹内容是否出现在 Markdown @ 命令中。
export type ReferencedFolder = { path: string; createdAt: string; enabled?: boolean }

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

// 项目文件夹数据。
export type ProjectFolder = {
  id: string
  projectId: string
  name: string
  createdAt: string
  updatedAt: string
}

// Markdown 页面数据。
export type MarkdownPage = { id: string; name: string; content: string }

// 项目条目数据。
export type ProjectItem = {
  id: string
  projectId: string
  projectFolderId?: string
  name: string
  itemData: string
  status: ProjectItemStatus
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

// 项目文件夹创建参数。
export type CreateProjectFolderInput = { projectId: string; name: string }

// 项目文件夹更新参数。
export type UpdateProjectFolderInput = { name: string }

// 项目条目创建参数。
export type CreateProjectItemInput = {
  projectId: string
  projectFolderId?: string
  name: string
  itemData?: string
}

// 项目条目更新参数。
export type UpdateProjectItemInput = {
  name?: string
  itemData?: string
  status?: ProjectItemStatus
}

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
    folders: {
      list: (projectId?: string) => Promise<ProjectFolder[]>
      create: (input: CreateProjectFolderInput) => Promise<ProjectFolder>
      update: (id: string, input: UpdateProjectFolderInput) => Promise<void>
      delete: (id: string) => Promise<void>
    }
    items: {
      list: (projectId?: string) => Promise<ProjectItem[]>
      create: (input: CreateProjectItemInput) => Promise<ProjectItem>
      update: (id: string, input: UpdateProjectItemInput) => Promise<void>
      sort: (ids: string[]) => Promise<ProjectItem[]>
      delete: (id: string) => Promise<void>
    }
  }
}
