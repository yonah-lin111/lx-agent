import type { GitApi } from "@shared/contracts/git"
import { GIT_CHANNELS } from "@shared/ipc/gitChannels"
import { ipcRenderer } from "electron"

// Git 领域 preload API：工作区只读状态查询。
export const gitApi: GitApi["git"] = {
  getStatus: (directory: string) => ipcRenderer.invoke(GIT_CHANNELS.getStatus, directory),
  listWorktrees: (directory: string) => ipcRenderer.invoke(GIT_CHANNELS.listWorktrees, directory),
}
