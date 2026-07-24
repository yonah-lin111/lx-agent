/// <reference types="vite/client" />

// 设计状态。
type DesignStatus = "todo" | "in_progress" | "completed"

// 项目数据。
type Project = {
  id: string
  name: string
  type: "filesystem" | "virtual"
  path?: string
  createdAt: string
  updatedAt: string
}

// 模块数据。
type Module = {
  id: string
  projectId: string
  name: string
  createdAt: string
  updatedAt: string
}

// 设计数据。
type Design = {
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

interface Window {
  api?: {
    project: {
      projects: {
        list: () => Promise<Project[]>
        create: (
          input: Pick<Project, "name"> & Partial<Pick<Project, "type" | "path">>,
        ) => Promise<Project>
        update: (
          id: string,
          input: Partial<Pick<Project, "name" | "type" | "path">>,
        ) => Promise<void>
        delete: (id: string) => Promise<void>
      }
      modules: {
        list: (projectId?: string) => Promise<Module[]>
        create: (input: Pick<Module, "projectId" | "name">) => Promise<Module>
        update: (id: string, input: Pick<Module, "name">) => Promise<void>
        delete: (id: string) => Promise<void>
      }
      designs: {
        list: (projectId?: string) => Promise<Design[]>
        create: (
          input: Pick<Design, "projectId" | "name"> &
            Partial<Pick<Design, "moduleId" | "designData">>,
        ) => Promise<Design>
        update: (
          id: string,
          input: Partial<Pick<Design, "name" | "designData" | "status">>,
        ) => Promise<void>
        sort: (ids: string[]) => Promise<Design[]>
        delete: (id: string) => Promise<void>
      }
    }
  }
}
