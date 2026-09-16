import type { ScheduleApi } from "@shared/contracts/schedule"
import { SCHEDULE_CHANNELS } from "@shared/ipc/scheduleChannels"
import { ipcRenderer } from "electron"

export const scheduleApi: ScheduleApi["schedule"] = {
  listByDate: (input) => ipcRenderer.invoke(SCHEDULE_CHANNELS.listByDate, input),
  create: (input) => ipcRenderer.invoke(SCHEDULE_CHANNELS.create, input),
  update: (input) => ipcRenderer.invoke(SCHEDULE_CHANNELS.update, input),
  remove: (id) => ipcRenderer.invoke(SCHEDULE_CHANNELS.remove, id),
  reorder: (input) => ipcRenderer.invoke(SCHEDULE_CHANNELS.reorder, input),
  listRangeStats: (input) => ipcRenderer.invoke(SCHEDULE_CHANNELS.listRangeStats, input),
}
