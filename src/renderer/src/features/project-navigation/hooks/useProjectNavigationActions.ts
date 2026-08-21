import { useCallback } from "react"
import { projectNavigationApi } from "@/features/project-navigation/api/projectNavigationApi"
import { useProjectItemsVersionStore } from "@/features/project-navigation/projectItemsStore"
import type {
  ProjectNavigationMenuTarget,
  ProjectNavigationProject,
  PromptStatus,
} from "@/features/project-navigation/types"

// 消息提示接口。
type Toast = { success: (message: string) => void; error: (message: string) => void }

/**
 * 提供项目导航中可独立于视图调用的条目操作。
 */
export const useProjectNavigationActions = (
  projects: ProjectNavigationProject[],
  refreshProjects: () => Promise<void>,
  toast: Toast,
): {
  updatePromptStatus: (id: string, status: PromptStatus) => Promise<void>
  createMenuItem: (
    menu: ProjectNavigationMenuTarget,
    type: "project_folder" | "prompt",
  ) => Promise<string | null>
  renameItem: (id: string, name: string) => Promise<boolean>
  saveProject: (projectId: string | null, name: string, path?: string) => Promise<string | null>
  importProject: () => Promise<string | null>
  deleteItem: (menu: ProjectNavigationMenuTarget) => Promise<boolean>
} => {
  const updatePromptStatus = useCallback(
    async (id: string, status: PromptStatus): Promise<void> => {
      try {
        await projectNavigationApi.updateItem(id, { status })
        await refreshProjects()
        useProjectItemsVersionStore.getState().bump()
        toast.success("条目状态更新成功")
      } catch {
        toast.error("条目状态更新失败")
      }
    },
    [refreshProjects, toast],
  )

  const createMenuItem = useCallback(
    async (
      menu: ProjectNavigationMenuTarget,
      type: "project_folder" | "prompt",
    ): Promise<string | null> => {
      if (type === "project_folder" && menu.type === "project_folder" && (menu.depth ?? 1) >= 2) {
        return null
      }
      try {
        const item =
          type === "project_folder"
            ? await projectNavigationApi.createFolder({
                projectId: menu.type === "project" ? menu.id : (menu.projectId ?? ""),
                parentFolderId: menu.type === "project_folder" ? menu.id : undefined,
                name: "new folder",
              })
            : await projectNavigationApi.createItem({
                projectId: menu.type === "project" ? menu.id : (menu.projectId ?? ""),
                projectFolderId: menu.type === "project_folder" ? menu.id : undefined,
                name: "new item",
              })
        await refreshProjects()
        toast.success(type === "project_folder" ? "文件夹创建成功" : "条目创建成功")
        return item.id
      } catch {
        toast.error(type === "project_folder" ? "文件夹创建失败" : "条目创建失败")
        return null
      }
    },
    [refreshProjects, toast],
  )

  const renameItem = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      const findFolder = (
        folders: ProjectNavigationProject["projectFolders"],
      ): ProjectNavigationProject["projectFolders"][number] | undefined => {
        for (const f of folders) {
          if (f.id === id) return f
          const found = findFolder(f.projectFolders)
          if (found) return found
        }
        return undefined
      }

      const project = projects.find((item) => item.id === id)
      const folder = projects.map((item) => findFolder(item.projectFolders)).find(Boolean)
      try {
        if (project) await projectNavigationApi.updateProject(id, { name })
        else if (folder) await projectNavigationApi.updateFolder(id, { name })
        else await projectNavigationApi.updateItem(id, { name })
        await refreshProjects()
        // 递增版本号，通知侧边栏与最近打开栏重新加载。
        useProjectItemsVersionStore.getState().bump()
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
          // 递增版本号，通知侧边栏与最近打开栏重新加载。
          useProjectItemsVersionStore.getState().bump()
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

  const importProject = useCallback(async (): Promise<string | null> => {
    const path = await projectNavigationApi.selectProjectDirectory()
    if (!path) return null

    const name =
      path
        .split(/[/\\\\]/)
        .filter(Boolean)
        .pop() ?? "未命名项目"
    return saveProject(null, name, path)
  }, [saveProject])

  const deleteItem = useCallback(
    async (menu: ProjectNavigationMenuTarget): Promise<boolean> => {
      try {
        if (menu.type === "project") await projectNavigationApi.deleteProject(menu.id)
        if (menu.type === "project_folder") await projectNavigationApi.deleteFolder(menu.id)
        if (menu.type === "prompt") await projectNavigationApi.deleteItem(menu.id)
        await refreshProjects()
        toast.success(
          menu.type === "project"
            ? "项目删除成功"
            : menu.type === "project_folder"
              ? "文件夹删除成功"
              : "条目删除成功",
        )
        return true
      } catch {
        toast.error(
          menu.type === "project"
            ? "项目删除失败"
            : menu.type === "project_folder"
              ? "文件夹删除失败"
              : "条目删除失败",
        )
        return false
      }
    },
    [refreshProjects, toast],
  )

  return {
    updatePromptStatus,
    createMenuItem,
    renameItem,
    saveProject,
    importProject,
    deleteItem,
  }
}
