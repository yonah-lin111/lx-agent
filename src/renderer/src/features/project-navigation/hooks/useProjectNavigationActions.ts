import { useCallback } from "react"
import { projectNavigationApi } from "@/features/project-navigation/api/projectNavigationApi"
import type {
  ProjectNavigationMenuTarget,
  ProjectNavigationProject,
  PromptStatus,
} from "@/features/project-navigation/types"

// 消息提示接口。
type Toast = { success: (message: string) => void; error: (message: string) => void }

// 提示词状态排序权重。
const PROMPT_STATUS_SORT_ORDER: Record<PromptStatus, number> = {
  in_progress: 0,
  todo: 1,
  completed: 2,
}

/**
 * 按状态稳定排序项目树中的全部提示词。
 */
export const getSortedPromptIds = (projects: ProjectNavigationProject[]): string[] =>
  projects
    .flatMap((project) => [
      ...project.modules.flatMap((module) => module.prompts),
      ...project.prompts,
    ])
    .map((prompt, index) => ({ prompt, index }))
    .sort(
      (left, right) =>
        PROMPT_STATUS_SORT_ORDER[left.prompt.status] -
          PROMPT_STATUS_SORT_ORDER[right.prompt.status] || left.index - right.index,
    )
    .map(({ prompt }) => prompt.id)

/**
 * 提供项目导航中可独立于视图调用的提示词操作。
 */
export const useProjectNavigationActions = (
  projects: ProjectNavigationProject[],
  refreshProjects: () => Promise<void>,
  toast: Toast,
): {
  sortPromptsByStatus: () => Promise<void>
  updatePromptStatus: (id: string, status: PromptStatus) => Promise<void>
  createMenuItem: (
    menu: ProjectNavigationMenuTarget,
    type: "module" | "prompt",
  ) => Promise<string | null>
  renameItem: (id: string, name: string) => Promise<boolean>
  saveProject: (projectId: string | null, name: string, path?: string) => Promise<string | null>
  deleteItem: (menu: ProjectNavigationMenuTarget) => Promise<boolean>
} => {
  const sortPromptsByStatus = useCallback(async (): Promise<void> => {
    await projectNavigationApi.sortDesigns(getSortedPromptIds(projects))
    await refreshProjects()
  }, [projects, refreshProjects])

  const updatePromptStatus = useCallback(
    async (id: string, status: PromptStatus): Promise<void> => {
      try {
        await projectNavigationApi.updateDesign(id, { status })
        await refreshProjects()
        toast.success("提示词状态更新成功")
      } catch {
        toast.error("提示词状态更新失败")
      }
    },
    [refreshProjects, toast],
  )

  const createMenuItem = useCallback(
    async (
      menu: ProjectNavigationMenuTarget,
      type: "module" | "prompt",
    ): Promise<string | null> => {
      try {
        const item =
          type === "module"
            ? await projectNavigationApi.createModule({ projectId: menu.id, name: "new module" })
            : await projectNavigationApi.createDesign({
                projectId: menu.type === "project" ? menu.id : (menu.projectId ?? ""),
                moduleId: menu.type === "module" ? menu.id : undefined,
                name: "new design",
              })
        await refreshProjects()
        toast.success(type === "module" ? "模块创建成功" : "提示词创建成功")
        return item.id
      } catch {
        toast.error(type === "module" ? "模块创建失败" : "提示词创建失败")
        return null
      }
    },
    [refreshProjects, toast],
  )

  const renameItem = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      const project = projects.find((item) => item.id === id)
      const module = projects.flatMap((item) => item.modules).find((item) => item.id === id)
      try {
        if (project) await projectNavigationApi.updateProject(id, { name })
        else if (module) await projectNavigationApi.updateModule(id, { name })
        else await projectNavigationApi.updateDesign(id, { name })
        await refreshProjects()
        return true
      } catch {
        return false
      }
    },
    [projects, refreshProjects],
  )

  const saveProject = useCallback(
    async (projectId: string | null, name: string, path?: string): Promise<string | null> => {
      const type = path ? "filesystem" : "virtual"
      try {
        if (projectId) {
          await projectNavigationApi.updateProject(projectId, { name, path: path ?? "", type })
          await refreshProjects()
          return projectId
        }
        const project = await projectNavigationApi.createProject({ name, path, type })
        await refreshProjects()
        toast.success("项目创建成功")
        return project.id
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_PATH_NOT_FOUND") {
          toast.error("项目路径不存在")
        } else if (!projectId) {
          toast.error("项目创建失败")
        }
        return null
      }
    },
    [refreshProjects, toast],
  )

  const deleteItem = useCallback(
    async (menu: ProjectNavigationMenuTarget): Promise<boolean> => {
      try {
        if (menu.type === "project") await projectNavigationApi.deleteProject(menu.id)
        if (menu.type === "module") await projectNavigationApi.deleteModule(menu.id)
        if (menu.type === "prompt") await projectNavigationApi.deleteDesign(menu.id)
        await refreshProjects()
        toast.success(
          menu.type === "project"
            ? "项目删除成功"
            : menu.type === "module"
              ? "模块删除成功"
              : "提示词删除成功",
        )
        return true
      } catch {
        toast.error(
          menu.type === "project"
            ? "项目删除失败"
            : menu.type === "module"
              ? "模块删除失败"
              : "提示词删除失败",
        )
        return false
      }
    },
    [refreshProjects, toast],
  )

  return {
    sortPromptsByStatus,
    updatePromptStatus,
    createMenuItem,
    renameItem,
    saveProject,
    deleteItem,
  }
}
