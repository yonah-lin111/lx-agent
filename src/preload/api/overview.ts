import type { OverviewApi } from "@shared/contracts/overview"
import { OVERVIEW_CHANNELS } from "@shared/ipc/overviewChannels"
import { ipcRenderer } from "electron"

export const overviewApi: OverviewApi["overview"] = {
  getStats: (input) => ipcRenderer.invoke(OVERVIEW_CHANNELS.getStats, input),
}
