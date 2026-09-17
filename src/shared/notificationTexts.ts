import type { Locale } from "./settings"

// 系统通知多语言文案（main 进程无 i18n 运行时，按 Locale 取用）。
export interface NotificationTexts {
  // 完成通知正文（标题使用会话名/员工名）。
  completedBody: string
  // 失败通知正文。
  failedBody: string
  // 发现新版本的正文（标题使用版本号）。
  updateBody: string
}

export const NOTIFICATION_TEXTS: Record<Locale, NotificationTexts> = {
  en: {
    completedBody: "Completed",
    failedBody: "Failed",
    updateBody: "A new version is available. Click to view.",
  },
  zh: {
    completedBody: "已完成",
    failedBody: "运行失败",
    updateBody: "发现新版本，点击查看。",
  },
}
