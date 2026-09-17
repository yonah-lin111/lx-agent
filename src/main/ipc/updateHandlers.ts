import { UPDATE_CHANNELS } from "@shared/ipc/updateChannels"
import { ipcMain } from "electron"
import { updateService } from "@/services/updateService"

/**
 * 注册应用更新检查 IPC 处理器。
 */
export const registerUpdateHandlers = (): void => {
  ipcMain.handle(UPDATE_CHANNELS.getState, () => updateService.getState())
  ipcMain.handle(UPDATE_CHANNELS.check, () => updateService.check({ force: true }))
}
