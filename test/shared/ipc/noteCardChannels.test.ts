import { NOTE_CARD_CHANNELS } from "@shared/ipc/noteCardChannels"
import { describe, expect, it } from "vitest"

describe("NOTE_CARD_CHANNELS", () => {
  it("为每个笔记卡片 IPC 操作提供唯一 channel", () => {
    const channels = Object.values(NOTE_CARD_CHANNELS)

    expect(new Set(channels)).toHaveLength(channels.length)
  })
})
