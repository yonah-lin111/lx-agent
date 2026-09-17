import { join } from "node:path"
import type { AgentEvent, AgentMessage, AssistantMessage } from "@shared/contracts/agent"
import type { NotificationClickPayload } from "@shared/contracts/notification"
import { NOTIFICATION_CHANNELS } from "@shared/ipc/notificationChannels"
import { NOTIFICATION_TEXTS } from "@shared/notificationTexts"
import {
  app,
  BrowserWindow,
  type NativeImage,
  Notification,
  nativeImage,
  type WebContents,
} from "electron"
import { agentSessionService } from "@/services/agentSessionService"
import { openExternalUrl } from "@/services/externalLinkService"
import { getOpenClawSettings, getUiSettings } from "@/services/settingsService"

// 同一目标重复完成通知的最小间隔（毫秒）。
const NOTIFY_THROTTLE_MS = 3000

// 会话标题缺失时的通知标题兜底。
const FALLBACK_TITLE = "LX Agent"

// 通知图标路径：开发态取仓库 resources，打包态取 extraResources（macOS 忽略，使用应用自身图标）。
const resolveNotificationIconPath = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, "resources", "icons", "lx-logo.png")
    : join(app.getAppPath(), "resources", "icons", "lx-logo.png")

// 懒加载的通知图标；文件缺失或加载失败时回退系统默认图标。
let cachedNotificationIcon: NativeImage | null | undefined

const getNotificationIcon = (): NativeImage | undefined => {
  if (cachedNotificationIcon === undefined) {
    const icon = nativeImage.createFromPath(resolveNotificationIconPath())
    cachedNotificationIcon = icon.isEmpty() ? null : icon
  }
  return cachedNotificationIcon ?? undefined
}

// 单条通知的投递参数。
interface NotifyInput {
  // 节流键：同一目标的重复通知按此丢弃。
  key: string
  title: string
  // 通知类别：决定正文文案与来源开关。
  kind: "completion" | "update"
  failed: boolean
  // 点击后推送给渲染进程的跳转目标（更新提醒无渲染跳转时省略）。
  payload?: NotificationClickPayload
  // 点击后的主进程副作用（更新提醒直接打开 Release 页）。
  onClick?: () => void
}

// OpenClaw 单次 run 结束回调负载。
export interface OpenClawRunFinished {
  instanceId: string
  agentId: string
  aborted: boolean
}

// 取 agent_end 载荷中最后一条助手消息。
const findLastAssistantMessage = (messages: AgentMessage[]): AssistantMessage | undefined => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === "assistant") return message
  }
  return undefined
}

// 解析会话标题作为通知标题。
const resolveSessionTitle = (sessionId?: string): string => {
  if (sessionId) {
    const title = agentSessionService.getSession(sessionId)?.title?.trim()
    if (title) return title
  }
  return FALLBACK_TITLE
}

// 解析 OpenClaw 员工名作为通知标题。
const resolveOpenClawAgentName = (instanceId: string, agentId: string): string => {
  const agent = getOpenClawSettings().instances[instanceId]?.agents.find(
    (item) => item.id === agentId,
  )
  return agent?.name?.trim() || agentId
}

/**
 * 系统通知服务：应用窗口未聚焦时投递 Agent 完成/失败原生通知。
 * 点击通知聚焦窗口，并把跳转目标推送给渲染进程。
 * 仅在 main 进程持有权威完成信号，renderer 不参与判定。
 */
class NotificationService {
  private resolveSender: (() => WebContents | undefined) | null = null
  private readonly lastNotifiedAt = new Map<string, number>()
  // 当前已投递通知：同目标新通知投递前关闭旧通知。
  private readonly activeNotifications = new Map<string, Notification>()

  // 注册渲染进程推送出口。
  attachSender(resolveSender: () => WebContents | undefined): void {
    this.resolveSender = resolveSender
  }

  // 主 Agent 事件入口：仅处理 agent_end，按停止原因分类。
  handleAgentEvent(event: AgentEvent): void {
    if (event.type !== "agent_end" || !event.tabId) return
    const stopReason = findLastAssistantMessage(event.messages)?.stopReason
    if (stopReason === "aborted") return
    this.notify({
      key: `agent:${event.tabId}`,
      title: resolveSessionTitle(event.sessionId),
      kind: "completion",
      failed: stopReason === "error",
      payload: { source: "agent", tabId: event.tabId },
    })
  }

  // OpenClaw run 结束入口：用户主动中止不提醒。
  handleOpenClawRunFinished(run: OpenClawRunFinished): void {
    if (run.aborted) return
    this.notify({
      key: `openclaw:${run.instanceId}:${run.agentId}`,
      title: resolveOpenClawAgentName(run.instanceId, run.agentId),
      kind: "completion",
      failed: false,
      payload: { source: "openclaw", instanceId: run.instanceId, agentId: run.agentId },
    })
  }

  // 应用更新入口：点击直接打开 Release 页，不做渲染进程跳转。
  notifyUpdateAvailable(input: { version: string; releaseUrl: string }): void {
    this.notify({
      key: `update:${input.version}`,
      title: `LX Agent v${input.version}`,
      kind: "update",
      failed: false,
      onClick: () => void openExternalUrl(input.releaseUrl),
    })
  }

  // 投递前依次执行来源开关、平台能力、窗口焦点与节流门禁。
  private notify(input: NotifyInput): void {
    const settings = getUiSettings()
    const source = input.payload?.source
    const enabled =
      source === "agent"
        ? settings.agentCompletionNotifyEnabled !== false
        : source === "openclaw"
          ? settings.openclawCompletionNotifyEnabled !== false
          : true
    if (!enabled) return
    if (!Notification.isSupported()) return
    if (this.isAppFocused()) return
    const now = Date.now()
    if (now - (this.lastNotifiedAt.get(input.key) ?? 0) < NOTIFY_THROTTLE_MS) return
    this.pruneThrottleMap(now)
    this.lastNotifiedAt.set(input.key, now)

    const texts = NOTIFICATION_TEXTS[settings.locale] ?? NOTIFICATION_TEXTS.en
    const body =
      input.kind === "update"
        ? texts.updateBody
        : input.failed
          ? texts.failedBody
          : texts.completedBody
    // Electron 39 的 Notification 不支持 id 覆盖，手动关闭同目标旧通知模拟替换。
    this.activeNotifications.get(input.key)?.close()
    const notification = new Notification({
      title: input.title,
      body,
      icon: getNotificationIcon(),
    })
    this.activeNotifications.set(input.key, notification)
    notification.on("close", () => {
      // 用户关闭/系统超时后释放引用，避免长会话内无限累积。
      if (this.activeNotifications.get(input.key) === notification) {
        this.activeNotifications.delete(input.key)
      }
    })
    notification.on("click", () => {
      this.focusMainWindow()
      input.onClick?.()
      const sender = this.resolveSender?.()
      if (input.payload && sender && !sender.isDestroyed()) {
        sender.send(NOTIFICATION_CHANNELS.click, input.payload)
      }
    })
    notification.show()
  }

  // 任一窗口聚焦即视为用户在场，不打扰。
  private isAppFocused(): boolean {
    return BrowserWindow.getAllWindows().some((window) => window.isFocused())
  }

  // 聚焦主窗口（最小化时先还原）。
  private focusMainWindow(): void {
    const [window] = BrowserWindow.getAllWindows()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  // 清理过期节流记录，避免 tab / 员工标识长期累积。
  private pruneThrottleMap(now: number): void {
    for (const [key, at] of this.lastNotifiedAt) {
      if (now - at >= NOTIFY_THROTTLE_MS) this.lastNotifiedAt.delete(key)
    }
  }
}

export const notificationService = new NotificationService()
