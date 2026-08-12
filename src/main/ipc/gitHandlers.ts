import { GIT_CHANNELS } from "@shared/ipc/gitChannels"
import { ipcMain } from "electron"
import { gitStatusService } from "@/services/gitStatusService"

// 校验输入为合法的目录路径字符串（IPC 输入边界）。
const isValidDirectory = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0

/**
 * 注册 Git 领域 IPC 处理器。
 */
export const registerGitHandlers = (): void => {
  ipcMain.handle(GIT_CHANNELS.getStatus, (_event, directory: unknown) => {
    if (!isValidDirectory(directory)) return null
    return gitStatusService.getStatus(directory)
  })
}
