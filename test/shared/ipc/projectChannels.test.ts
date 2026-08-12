import { PROJECT_CHANNELS } from "@shared/ipc/projectChannels"
import { describe, expect, it } from "vitest"

describe("PROJECT_CHANNELS", () => {
  it("为每个项目 IPC 操作提供唯一 channel", () => {
    const channels = Object.values(PROJECT_CHANNELS)

    expect(channels).toHaveLength(17)
    expect(new Set(channels)).toHaveLength(channels.length)
  })
})
