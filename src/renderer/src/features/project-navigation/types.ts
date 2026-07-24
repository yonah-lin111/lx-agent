import type { DesignStatus } from "@shared/project"

// 项目导航菜单项类型。
export type ProjectNavigationMenuType = "project" | "module" | "prompt"

// 项目导航展示的提示词状态。
export type PromptStatus = DesignStatus

// 项目导航展示的提示词数据。
export interface ProjectNavigationPrompt {
  id: string
  name: string
  status: PromptStatus
}

// 项目导航展示的模块数据。
export interface ProjectNavigationModule {
  id: string
  name: string
  prompts: ProjectNavigationPrompt[]
}

// 项目导航展示的项目树节点。
export interface ProjectNavigationProject {
  id: string
  name: string
  path?: string
  modules: ProjectNavigationModule[]
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
