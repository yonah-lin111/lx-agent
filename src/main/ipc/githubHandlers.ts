import { GITHUB_CHANNELS } from "@shared/ipc/githubChannels"
import { ipcMain } from "electron"
import { githubService } from "@/services/githubService"

/**
 * 注册 GitHub 仓库元数据 IPC 处理器。
 */
export const registerGitHubHandlers = (): void => {
  ipcMain.handle(GITHUB_CHANNELS.getStars, () => githubService.getStars())
}
