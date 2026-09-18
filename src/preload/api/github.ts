import type { GitHubApi } from "@shared/contracts/github"
import { GITHUB_CHANNELS } from "@shared/ipc/githubChannels"
import { ipcRenderer } from "electron"

// GitHub 仓库元数据领域 Preload API：读取缓存后的星标状态。
export const githubApi: GitHubApi["github"] = {
  getStars: () => ipcRenderer.invoke(GITHUB_CHANNELS.getStars),
}
