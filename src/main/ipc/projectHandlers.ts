import { ipcMain } from "electron"
import { projectService } from "@/services/projectService"

/**
 * 注册项目树数据的 IPC CRUD 处理器。
 */
export const registerProjectHandlers = (): void => {
  ipcMain.handle("project:projects:list", () => projectService.listProjects())
  ipcMain.handle("project:projects:create", (_, input) => projectService.createProject(input))
  ipcMain.handle("project:projects:update", (_, id, input) =>
    projectService.updateProject(id, input),
  )
  ipcMain.handle("project:projects:delete", (_, id) => projectService.deleteProject(id))

  ipcMain.handle("project:modules:list", (_, projectId) => projectService.listModules(projectId))
  ipcMain.handle("project:modules:create", (_, input) => projectService.createModule(input))
  ipcMain.handle("project:modules:update", (_, id, input) => projectService.updateModule(id, input))
  ipcMain.handle("project:modules:delete", (_, id) => projectService.deleteModule(id))

  ipcMain.handle("project:designs:list", (_, projectId) => projectService.listDesigns(projectId))
  ipcMain.handle("project:designs:create", (_, input) => projectService.createDesign(input))
  ipcMain.handle("project:designs:update", (_, id, input) => projectService.updateDesign(id, input))
  ipcMain.handle("project:designs:sort", (_, ids) => projectService.sortDesigns(ids))
  ipcMain.handle("project:designs:delete", (_, id) => projectService.deleteDesign(id))
}
