import { describe, expect, it } from "vitest"
import { buildQaGroups, groupAgentMessages } from "@/features/agent/messageGrouping"
import type { ChatMessage } from "@/features/agent/types"

// 构造展示条目（分组逻辑只依赖 role/id，块内容不参与）。
const user = (id: string): ChatMessage => ({
  id,
  role: "user",
  blocks: [{ kind: "text", text: "q" }],
  isStreaming: false,
})

const assistant = (id: string): ChatMessage => ({
  id,
  role: "assistant",
  blocks: [{ kind: "text", text: "a" }],
  isStreaming: false,
})

const toolResult = (id: string): ChatMessage => ({
  id,
  role: "toolResult",
  blocks: [{ kind: "toolResult", toolCallId: id, toolName: "read", text: "r", isError: false }],
  isStreaming: false,
})

const compactionSummary = (id: string): ChatMessage => ({
  id,
  role: "compactionSummary",
  blocks: [{ kind: "text", text: "summary" }],
  isStreaming: false,
})

describe("groupAgentMessages", () => {
  it("助手消息后的工具结果与续写助手消息合并为同一展示条目", () => {
    const entries = groupAgentMessages([
      user("u"),
      assistant("a1"),
      toolResult("t1"),
      assistant("a2"),
      toolResult("t2"),
      assistant("a3"),
    ])
    expect(entries.map((entry) => entry.message.id)).toEqual(["u", "a1"])
    expect(entries[1].continuationMessages.map((message) => message.id)).toEqual([
      "t1",
      "a2",
      "t2",
      "a3",
    ])
  })

  it("用户消息会切断连续归类", () => {
    const entries = groupAgentMessages([assistant("a1"), user("u"), assistant("a2")])
    expect(entries.map((entry) => entry.message.id)).toEqual(["a1", "u", "a2"])
    expect(entries[1].continuationMessages).toEqual([])
  })

  it("压缩摘要块不会并入助手消息", () => {
    const entries = groupAgentMessages([assistant("a1"), compactionSummary("c"), assistant("a2")])
    expect(entries.map((entry) => entry.message.id)).toEqual(["a1", "c", "a2"])
  })

  it("连续的撤销摘要块堆叠合并到同一个 entry", () => {
    const undo1: ChatMessage = {
      id: "undo-1",
      role: "undoSummary",
      blocks: [],
      isStreaming: false,
    }
    const undo2: ChatMessage = {
      id: "undo-2",
      role: "undoSummary",
      blocks: [],
      isStreaming: false,
    }
    const entries = groupAgentMessages([user("u"), undo1, undo2])
    expect(entries.map((entry) => entry.message.id)).toEqual(["u", "undo-1"])
    expect(entries[1].continuationMessages.map((m) => m.id)).toEqual(["undo-2"])
  })
})

describe("buildQaGroups", () => {
  it("用户消息与其后的 AI 回复组成一个 QA 组", () => {
    const groups = buildQaGroups(groupAgentMessages([user("u"), assistant("a1"), toolResult("t1")]))
    expect(groups).toHaveLength(1)
    expect(groups[0].userMessage?.id).toBe("u")
    expect(groups[0].assistant?.message.id).toBe("a1")
  })

  it("无用户消息的孤立 AI 回复自成一组", () => {
    const groups = buildQaGroups(groupAgentMessages([assistant("a1")]))
    expect(groups).toHaveLength(1)
    expect(groups[0].userMessage).toBeNull()
    expect(groups[0].assistant?.message.id).toBe("a1")
  })
})
