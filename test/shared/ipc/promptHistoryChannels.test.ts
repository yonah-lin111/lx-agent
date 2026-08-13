import { PROMPT_HISTORY_CHANNELS } from "@shared/ipc/promptHistoryChannels"
import { describe, expect, it } from "vitest"

describe("PROMPT_HISTORY_CHANNELS", () => {
  it("为每个提示词历史 IPC 操作提供唯一 channel", () => {
    const channels = Object.values(PROMPT_HISTORY_CHANNELS)

    expect(new Set(channels)).toHaveLength(channels.length)
  })
})
