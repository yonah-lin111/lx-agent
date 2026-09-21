import { describe, expect, it } from "vitest"
import type { ChatMessage } from "@/features/agent/types"
import { upsertSwitchMessage } from "@/features/agent/utils"

const modeSwitch = (id: string, mode: "plan" | "review", timestamp = 1): ChatMessage => ({
  id,
  role: "modeSwitch",
  blocks: [],
  isStreaming: false,
  timestamp,
  collaborationMode: mode,
})

const modelSwitch = (id: string, model: string, timestamp = 1): ChatMessage => ({
  id,
  role: "modelSwitch",
  blocks: [],
  isStreaming: false,
  timestamp,
  model,
  provider: "p",
  family: "gpt",
})

const user = (id: string): ChatMessage => ({
  id,
  role: "user",
  blocks: [{ kind: "text", text: "hi" }],
  isStreaming: false,
})

describe("upsertSwitchMessage 会话尾部连续切换合并", () => {
  it("尾部已有同类切换条目时原地更新（保留 id 与位置）", () => {
    const first = upsertSwitchMessage([], modeSwitch("m1", "plan"))
    const second = upsertSwitchMessage(first, modeSwitch("m2", "review", 2))

    expect(second).toHaveLength(1)
    expect(second[0].id).toBe("m1")
    expect(second[0].collaborationMode).toBe("review")
  })

  it("模型与模式切换各自合并，互不干扰（来回切换仍只有两条切换条目）", () => {
    let messages: ChatMessage[] = []
    messages = upsertSwitchMessage(messages, modeSwitch("m1", "plan"))
    messages = upsertSwitchMessage(messages, modelSwitch("s1", "gpt-4o"))
    messages = upsertSwitchMessage(messages, modeSwitch("m2", "review", 2))
    messages = upsertSwitchMessage(messages, modelSwitch("s2", "claude", 2))

    expect(messages).toHaveLength(2)
    expect(messages.map((item) => item.role)).toEqual(["modeSwitch", "modelSwitch"])
    expect(messages[0].collaborationMode).toBe("review")
    expect(messages[1].model).toBe("claude")
  })

  it("尾部连续切换被真实消息打断后重新追加新条目", () => {
    let messages: ChatMessage[] = []
    messages = upsertSwitchMessage(messages, modeSwitch("m1", "plan"))
    messages = [...messages, user("u1")]
    messages = upsertSwitchMessage(messages, modeSwitch("m2", "review", 2))

    expect(messages).toHaveLength(3)
    expect(messages[2].role).toBe("modeSwitch")
    expect(messages[2].id).toBe("m2")
  })

  it("非切换消息按普通追加处理", () => {
    const messages = upsertSwitchMessage([], user("u1"))
    expect(messages).toHaveLength(1)
  })
})
