import type { ProjectItemStatus } from "@shared/project"

// 项目导航菜单项类型。
export type ProjectNavigationMenuType = "project" | "project_folder" | "prompt"

// 项目导航条目筛选范围。
export type ProjectNavigationFilterScope = "current" | "all"

// 项目导航展示的条目状态。
export type PromptStatus = ProjectItemStatus

// 项目导航排序键。
export type ProjectNavigationSortKey = "name" | "createdAt" | "updatedAt"

// 项目导航排序方向。
export type ProjectNavigationSortDirection = "asc" | "desc"

// 项目导航展示的条目数据。
export interface ProjectNavigationPrompt {
  id: string
  name: string
  status: PromptStatus
  createdAt: string
  updatedAt: string
}

// 项目导航展示的文件夹数据。
export interface ProjectNavigationFolder {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  prompts: ProjectNavigationPrompt[]
}

// 项目导航展示的项目树节点。
export interface ProjectNavigationProject {
  id: string
  name: string
  path?: string
  createdAt: string
  updatedAt: string
  projectFolders: ProjectNavigationFolder[]
  prompts: ProjectNavigationPrompt[]
}

// 行内编辑状态。
export type EditingItem = { id: string; name: string }

// 菜单目标数据。
export type ProjectNavigationMenuTarget = {
  type: ProjectNavigationMenuType
  id: string
  projectId?: string
}
