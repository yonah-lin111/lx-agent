import { PROJECT_CHANNELS } from "@shared/ipc/projectChannels"
import { dialog, ipcMain } from "electron"
import { projectService } from "@/services/projectService"

/**
 * 注册项目树数据的 IPC CRUD 处理器。
 */
export const registerProjectHandlers = (): void => {
  ipcMain.handle(PROJECT_CHANNELS.listProjects, () => projectService.listProjects())
  ipcMain.handle(PROJECT_CHANNELS.createProject, (_, input) => projectService.createProject(input))
  ipcMain.handle(PROJECT_CHANNELS.updateProject, (_, id, input) =>
    projectService.updateProject(id, input),
  )
  ipcMain.handle(PROJECT_CHANNELS.deleteProject, (_, id) => projectService.deleteProject(id))
  ipcMain.handle(PROJECT_CHANNELS.selectProjectDirectory, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "选择项目文件夹",
    })

    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle(PROJECT_CHANNELS.searchProjectFiles, (_, projectId, query) => {
    if (typeof projectId !== "string" || typeof query !== "string") {
      throw new Error("INVALID_PROJECT_FILE_SEARCH_INPUT")
    }

    return projectService.searchProjectFiles(projectId, query)
  })
  ipcMain.handle(PROJECT_CHANNELS.searchReferencedProjectFiles, (_, projectPaths, query) => {
    if (
      !Array.isArray(projectPaths) ||
      !projectPaths.every((projectPath) => typeof projectPath === "string") ||
      typeof query !== "string"
    ) {
      throw new Error("INVALID_REFERENCED_PROJECT_FILE_SEARCH_INPUT")
    }

    return projectService.searchReferencedProjectFiles(projectPaths, query)
  })
  ipcMain.handle(PROJECT_CHANNELS.searchDirectoryFiles, (_, directory, query) => {
    if (typeof directory !== "string" || typeof query !== "string") {
      throw new Error("INVALID_DIRECTORY_FILE_SEARCH_INPUT")
    }

    return projectService.searchDirectoryFiles(directory, query)
  })

  ipcMain.handle(PROJECT_CHANNELS.listFolders, (_, projectId) =>
    projectService.listFolders(projectId),
  )
  ipcMain.handle(PROJECT_CHANNELS.createFolder, (_, input) => projectService.createFolder(input))
  ipcMain.handle(PROJECT_CHANNELS.updateFolder, (_, id, input) =>
    projectService.updateFolder(id, input),
  )
  ipcMain.handle(PROJECT_CHANNELS.deleteFolder, (_, id) => projectService.deleteFolder(id))

  ipcMain.handle(PROJECT_CHANNELS.listItems, (_, projectId) => projectService.listItems(projectId))
  ipcMain.handle(PROJECT_CHANNELS.createItem, (_, input) => projectService.createItem(input))
  ipcMain.handle(PROJECT_CHANNELS.updateItem, (_, id, input) =>
    projectService.updateItem(id, input),
  )
  ipcMain.handle(PROJECT_CHANNELS.sortItems, (_, ids) => projectService.sortItems(ids))
  ipcMain.handle(PROJECT_CHANNELS.deleteItem, (_, id) => projectService.deleteItem(id))
}
