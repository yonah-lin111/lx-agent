import { ACTIVITY_CHANNELS } from "@shared/ipc/activityChannels"
import { ipcMain } from "electron"
import { activityService } from "@/services/activityService"

/**
 * 注册活动数据的 IPC 查询处理器。
 */
export const registerActivityHandlers = (): void => {
  ipcMain.handle(ACTIVITY_CHANNELS.getDaily, () => activityService.getDaily())
}
