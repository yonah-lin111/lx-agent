import { OPENCLAW_CHANNELS } from "@shared/ipc/openclawChannels"
import { describe, expect, it } from "vitest"

describe("OPENCLAW_CHANNELS", () => {
  it("为每个 OpenClaw IPC 操作提供唯一 channel", () => {
    const channels = Object.values(OPENCLAW_CHANNELS)

    expect(new Set(channels)).toHaveLength(channels.length)
  })

  it("channel 统一使用 openclaw: 前缀", () => {
    for (const channel of Object.values(OPENCLAW_CHANNELS)) {
      expect(channel.startsWith("openclaw:")).toBe(true)
    }
  })
})
