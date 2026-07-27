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

  ipcMain.handle(PROJECT_CHANNELS.listModules, (_, projectId) =>
    projectService.listModules(projectId),
  )
  ipcMain.handle(PROJECT_CHANNELS.createModule, (_, input) => projectService.createModule(input))
  ipcMain.handle(PROJECT_CHANNELS.updateModule, (_, id, input) =>
    projectService.updateModule(id, input),
  )
  ipcMain.handle(PROJECT_CHANNELS.deleteModule, (_, id) => projectService.deleteModule(id))

  ipcMain.handle(PROJECT_CHANNELS.listDesigns, (_, projectId) =>
    projectService.listDesigns(projectId),
  )
  ipcMain.handle(PROJECT_CHANNELS.createDesign, (_, input) => projectService.createDesign(input))
  ipcMain.handle(PROJECT_CHANNELS.updateDesign, (_, id, input) =>
    projectService.updateDesign(id, input),
  )
  ipcMain.handle(PROJECT_CHANNELS.sortDesigns, (_, ids) => projectService.sortDesigns(ids))
  ipcMain.handle(PROJECT_CHANNELS.deleteDesign, (_, id) => projectService.deleteDesign(id))
}
