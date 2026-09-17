// 系统通知点击跳转负载：按来源区分跳转目标。
export type NotificationClickPayload =
  | { source: "agent"; tabId: string }
  | { source: "openclaw"; instanceId: string; agentId: string }

// 系统通知领域 preload API 契约。
export interface NotificationApi {
  notification: {
    onClick: (handler: (payload: NotificationClickPayload) => void) => () => void
  }
}
