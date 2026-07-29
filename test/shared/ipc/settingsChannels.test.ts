import { SETTINGS_CHANNELS } from "@shared/ipc/settingsChannels"
import { describe, expect, it } from "vitest"

describe("SETTINGS_CHANNELS", () => {
  it("为每个设置 IPC 操作提供唯一 channel", () => {
    const channels = Object.values(SETTINGS_CHANNELS)

    expect(new Set(channels)).toHaveLength(channels.length)
  })
})
