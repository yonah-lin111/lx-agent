import { NOTIFICATION_CHANNELS } from "@shared/ipc/notificationChannels"
import { describe, expect, it } from "vitest"

describe("NOTIFICATION_CHANNELS", () => {
  it("为每个通知 IPC 操作提供唯一 channel", () => {
    const channels = Object.values(NOTIFICATION_CHANNELS)

    expect(new Set(channels)).toHaveLength(channels.length)
  })
})
