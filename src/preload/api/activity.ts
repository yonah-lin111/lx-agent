import type { ActivityApi } from "@shared/contracts/activity"
import { ACTIVITY_CHANNELS } from "@shared/ipc/activityChannels"
import { ipcRenderer } from "electron"

export const activityApi: ActivityApi["activity"] = {
  getDaily: () => ipcRenderer.invoke(ACTIVITY_CHANNELS.getDaily),
}
