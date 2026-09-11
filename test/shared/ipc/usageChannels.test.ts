import { USAGE_CHANNELS } from "@shared/ipc/usageChannels"
import { describe, expect, it } from "vitest"

describe("USAGE_CHANNELS", () => {
  it("为每个用量 IPC 操作提供唯一 channel", () => {
    const channels = Object.values(USAGE_CHANNELS)

    expect(new Set(channels)).toHaveLength(channels.length)
  })

  it("channel 统一使用 usage: 前缀", () => {
    for (const channel of Object.values(USAGE_CHANNELS)) {
      expect(channel.startsWith("usage:")).toBe(true)
    }
  })
})
