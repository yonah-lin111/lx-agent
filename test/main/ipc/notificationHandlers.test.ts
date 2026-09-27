import { NOTIFICATION_CHANNELS } from "@shared/ipc/notificationChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const on = vi.fn()

vi.mock("electron", () => ({ ipcMain: { on } }))
vi.mock("@/services/notificationService", () => ({
  notificationService: { showDemoNotification: vi.fn() },
}))

describe("notification IPC handlers", () => {
  beforeEach(() => {
    on.mockClear()
  })

  it("为演示通道注册 handler 并转发到通知服务", async () => {
    const { registerNotificationHandlers } = await import("@/ipc/notificationHandlers")
    const { notificationService } = await import("@/services/notificationService")

    registerNotificationHandlers()

    expect(on).toHaveBeenCalledWith(NOTIFICATION_CHANNELS.demo, expect.any(Function))
    const handler = on.mock.calls.find(([channel]) => channel === NOTIFICATION_CHANNELS.demo)?.[1]
    handler()
    expect(notificationService.showDemoNotification).toHaveBeenCalledOnce()
  })
})
