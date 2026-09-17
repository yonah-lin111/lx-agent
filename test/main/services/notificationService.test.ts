// @vitest-environment node
import type { AgentEvent } from "@shared/contracts/agent"
import type { StopReason } from "@shared/contracts/agent/primitives"
import { NOTIFICATION_CHANNELS } from "@shared/ipc/notificationChannels"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

interface FakeWindow {
  isFocused: () => boolean
  isMinimized: () => boolean
  restore: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
}

interface FakeNotificationInstance {
  options: { title?: string; body?: string; icon?: unknown }
  show: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  clickHandlers: Array<() => void>
}

const holder = vi.hoisted(() => ({
  windows: [] as FakeWindow[],
  notifications: [] as FakeNotificationInstance[],
  supported: true,
  createFromPath: vi.fn(() => ({ isEmpty: () => false })),
  uiSettings: {
    locale: "zh" as "zh" | "en",
    agentCompletionNotifyEnabled: true as boolean | undefined,
    openclawCompletionNotifyEnabled: true as boolean | undefined,
  },
  openclawInstances: {} as Record<string, { agents: Array<{ id: string; name: string }> }>,
  sessions: {} as Record<string, { title: string }>,
}))

vi.mock("electron", () => {
  class FakeNotification {
    options: { title?: string; body?: string; icon?: unknown }
    show = vi.fn()
    close = vi.fn()
    clickHandlers: Array<() => void> = []
    static isSupported(): boolean {
      return holder.supported
    }
    constructor(options: { title?: string; body?: string; icon?: unknown }) {
      this.options = options
      holder.notifications.push(this)
    }
    on(event: string, handler: () => void): void {
      if (event === "click") this.clickHandlers.push(handler)
    }
  }
  return {
    BrowserWindow: { getAllWindows: () => holder.windows },
    Notification: FakeNotification,
    app: { isPackaged: false, getAppPath: () => "/tmp/lx-agent" },
    nativeImage: { createFromPath: holder.createFromPath },
  }
})

vi.mock("@/services/settingsService", () => ({
  getUiSettings: () => holder.uiSettings,
  getOpenClawSettings: () => ({ instances: holder.openclawInstances }),
}))

vi.mock("@/services/agentSessionService", () => ({
  agentSessionService: { getSession: (sessionId: string) => holder.sessions[sessionId] },
}))

import { notificationService } from "@/services/notificationService"

const createWindow = (focused: boolean, minimized = false): FakeWindow => ({
  isFocused: () => focused,
  isMinimized: () => minimized,
  restore: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
})

const agentEnd = (tabId: string, stopReason: StopReason, sessionId = "sess-1"): AgentEvent => ({
  type: "agent_end",
  sessionId,
  tabId,
  messages: [
    {
      role: "assistant",
      content: [],
      provider: "test",
      model: "test-model",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
      stopReason,
      timestamp: 1,
    },
  ],
})

describe("notificationService", () => {
  beforeEach(() => {
    holder.windows = [createWindow(false)]
    holder.notifications = []
    holder.supported = true
    holder.uiSettings = {
      locale: "zh",
      agentCompletionNotifyEnabled: true,
      openclawCompletionNotifyEnabled: true,
    }
    holder.openclawInstances = {}
    holder.sessions = { "sess-1": { title: "修复登录" } }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("窗口聚焦时不投递通知", () => {
    holder.windows = [createWindow(true)]

    notificationService.handleAgentEvent(agentEnd("tab-focused", "stop"))

    expect(holder.notifications).toHaveLength(0)
  })

  it("窗口失焦时按会话标题与本地化完成文案投递通知", () => {
    notificationService.handleAgentEvent(agentEnd("tab-done", "stop"))

    expect(holder.notifications).toHaveLength(1)
    expect(holder.notifications[0]?.options).toMatchObject({
      title: "修复登录",
      body: "已完成",
    })
    expect(holder.notifications[0]?.options.icon).toBeDefined()
    expect(holder.createFromPath).toHaveBeenCalledWith(
      expect.stringContaining("resources/icons/lx-logo.png"),
    )
    expect(holder.notifications[0]?.show).toHaveBeenCalledOnce()
  })

  it("会话标题缺失时使用兜底标题", () => {
    notificationService.handleAgentEvent(agentEnd("tab-no-title", "stop", "sess-unknown"))

    expect(holder.notifications[0]?.options.title).toBe("LX Agent")
  })

  it("错误停止投递失败文案，用户中止不投递", () => {
    notificationService.handleAgentEvent(agentEnd("tab-error", "error"))
    notificationService.handleAgentEvent(agentEnd("tab-aborted", "aborted"))

    expect(holder.notifications).toHaveLength(1)
    expect(holder.notifications[0]?.options).toMatchObject({
      title: "修复登录",
      body: "运行失败",
    })
  })

  it("来源开关关闭或缺省关闭时不投递", () => {
    holder.uiSettings.agentCompletionNotifyEnabled = false
    holder.uiSettings.openclawCompletionNotifyEnabled = false

    notificationService.handleAgentEvent(agentEnd("tab-disabled", "stop"))
    notificationService.handleOpenClawRunFinished({
      instanceId: "i-disabled",
      agentId: "a1",
      aborted: false,
    })

    expect(holder.notifications).toHaveLength(0)
  })

  it("平台不支持通知时不投递", () => {
    holder.supported = false

    notificationService.handleAgentEvent(agentEnd("tab-unsupported", "stop"))

    expect(holder.notifications).toHaveLength(0)
  })

  it("同一 tab 3 秒内重复完成只投递第一条，超时后新通知替换旧通知", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))

    notificationService.handleAgentEvent(agentEnd("tab-throttle", "stop"))
    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"))
    notificationService.handleAgentEvent(agentEnd("tab-throttle", "stop"))
    expect(holder.notifications).toHaveLength(1)

    vi.setSystemTime(new Date("2026-01-01T00:00:04.000Z"))
    notificationService.handleAgentEvent(agentEnd("tab-throttle", "stop"))
    expect(holder.notifications).toHaveLength(2)
    expect(holder.notifications[0]?.close).toHaveBeenCalledOnce()
    expect(holder.notifications[1]?.close).not.toHaveBeenCalled()
  })

  it("点击通知聚焦窗口并推送跳转目标", () => {
    const window = createWindow(false, true)
    holder.windows = [window]
    const sender = { send: vi.fn(), isDestroyed: () => false }
    notificationService.attachSender(() => sender as never)

    notificationService.handleAgentEvent(agentEnd("tab-click", "stop"))
    holder.notifications[0]?.clickHandlers[0]?.()

    expect(window.restore).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
    expect(sender.send).toHaveBeenCalledWith(NOTIFICATION_CHANNELS.click, {
      source: "agent",
      tabId: "tab-click",
    })
  })

  it("OpenClaw 员工完成按员工名投递，中止不投递", () => {
    holder.openclawInstances = { i1: { agents: [{ id: "a1", name: "小助手" }] } }

    notificationService.handleOpenClawRunFinished({
      instanceId: "i1",
      agentId: "a1",
      aborted: true,
    })
    notificationService.handleOpenClawRunFinished({
      instanceId: "i1",
      agentId: "a1",
      aborted: false,
    })
    notificationService.handleOpenClawRunFinished({
      instanceId: "i1",
      agentId: "a-unknown",
      aborted: false,
    })

    expect(holder.notifications).toHaveLength(2)
    expect(holder.notifications[0]?.options).toMatchObject({
      title: "小助手",
      body: "已完成",
    })
    expect(holder.notifications[1]?.options.title).toBe("a-unknown")
  })
})
