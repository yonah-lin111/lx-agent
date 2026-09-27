import { NOTIFICATION_CHANNELS } from "@shared/ipc/notificationChannels"
import { ipcMain } from "electron"
import { notificationService } from "@/services/notificationService"

/**
 * 注册系统通知领域的 IPC 处理器。
 */
export const registerNotificationHandlers = (): void => {
  // UI 预览页触发的演示通知，无需返回值。
  ipcMain.on(NOTIFICATION_CHANNELS.demo, () => notificationService.showDemoNotification())
}
