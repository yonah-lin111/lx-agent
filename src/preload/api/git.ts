import type { GitApi } from "@shared/contracts/git"
import { GIT_CHANNELS } from "@shared/ipc/gitChannels"
import { ipcRenderer } from "electron"

// Git 领域 preload API：工作区与分支状态/操作。
export const gitApi: GitApi["git"] = {
  getStatus: (directory: string) => ipcRenderer.invoke(GIT_CHANNELS.getStatus, directory),
  listWorktrees: (directory: string) => ipcRenderer.invoke(GIT_CHANNELS.listWorktrees, directory),
  listBranches: (directory: string) => ipcRenderer.invoke(GIT_CHANNELS.listBranches, directory),
  checkoutBranch: (directory: string, branch: string) =>
    ipcRenderer.invoke(GIT_CHANNELS.checkoutBranch, directory, branch),
}
