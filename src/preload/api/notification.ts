import type { NotificationApi, NotificationClickPayload } from "@shared/contracts/notification"
import { NOTIFICATION_CHANNELS } from "@shared/ipc/notificationChannels"
import { ipcRenderer } from "electron"

// 系统通知领域 Preload API：订阅点击跳转目标。
export const notificationApi: NotificationApi["notification"] = {
  onClick: (handler: (payload: NotificationClickPayload) => void) => {
    const listener = (_: unknown, payload: NotificationClickPayload): void => handler(payload)
    ipcRenderer.on(NOTIFICATION_CHANNELS.click, listener)
    return () => {
      ipcRenderer.removeListener(NOTIFICATION_CHANNELS.click, listener)
    }
  },
}
