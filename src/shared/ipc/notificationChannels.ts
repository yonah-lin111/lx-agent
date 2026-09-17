// 系统通知领域 IPC channel。
export const NOTIFICATION_CHANNELS = {
  // 点击系统通知后，main → renderer 推送跳转目标。
  click: "notification:click",
} as const
