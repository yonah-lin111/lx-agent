import { AGENT_CHANNELS } from "@shared/ipc/agentChannels"
import { describe, expect, it } from "vitest"

describe("AGENT_CHANNELS", () => {
  it("为每个 Agent IPC 操作提供唯一 channel", () => {
    const channels = Object.values(AGENT_CHANNELS)

    expect(new Set(channels)).toHaveLength(channels.length)
  })
})
