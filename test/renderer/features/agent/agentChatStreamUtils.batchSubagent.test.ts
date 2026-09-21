// @vitest-environment jsdom

import type { AgentMessage, SubagentData } from "@shared/contracts/agent"
import { describe, expect, it } from "vitest"
import { mergeSubagentSnapshots } from "@/features/agent/hooks/agentChatStreamUtils"
import type { ChatMessage } from "@/features/agent/types"
import { toChatMessage } from "@/features/agent/utils"

// 批量子代理快照。
const buildItem = (id: string, name: string): SubagentData => ({
  subagentId: id,
  name,
  description: `${name} 任务`,
  prompt: `${name} 任务`,
  messages: [],
  steps: [],
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
})

describe("批量子代理快照回填", () => {
  it("toChatMessage 把 ToolResultMessage.subagents 落到 toolResult 块", () => {
    const message: AgentMessage = {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "task",
      content: [{ type: "text", text: "[1/2] review-auth - done" }],
      isError: false,
      timestamp: 1,
      subagents: [buildItem("subagent-1", "review-auth"), buildItem("subagent-2", "review-db")],
    }

    const chat = toChatMessage(message, false, "t1")
    const block = chat.blocks[0]
    expect(block?.kind).toBe("toolResult")
    if (block?.kind !== "toolResult") return
    expect(block.subagents?.map((item) => item.name)).toEqual(["review-auth", "review-db"])
  })

  it("mergeSubagentSnapshots 把批量快照从 toolResult 回填到对应 toolCall 块", () => {
    const messages: ChatMessage[] = [
      {
        id: "a1",
        role: "assistant",
        isStreaming: false,
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "call-1",
            toolName: "task",
            args: { tasks: [] },
            status: "running",
          },
        ],
      },
      {
        id: "t1",
        role: "toolResult",
        isStreaming: false,
        blocks: [
          {
            kind: "toolResult",
            toolCallId: "call-1",
            toolName: "task",
            text: "[1/2] review-auth - done",
            isError: false,
            subagents: [
              buildItem("subagent-1", "review-auth"),
              buildItem("subagent-2", "review-db"),
            ],
          },
        ],
      },
    ]

    const merged = mergeSubagentSnapshots(messages)
    const block = merged[0]?.blocks[0]
    expect(block?.kind).toBe("toolCall")
    if (block?.kind !== "toolCall") return
    expect(block.subagents?.map((item) => item.name)).toEqual(["review-auth", "review-db"])
  })
})
