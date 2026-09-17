import type { NotificationClickPayload } from "@shared/contracts/notification"

// 通知 feature 的 preload API 访问入口。
export const notificationApi = {
  onClick: (handler: (payload: NotificationClickPayload) => void): (() => void) =>
    window?.api?.notification?.onClick ? window.api.notification.onClick(handler) : () => {},
}
