import type { AgentMessage, ToolResultMessage } from "@shared/contracts/agent"
import { describe, expect, it } from "vitest"
import { pruneHistoricalToolOutputs } from "../../../../src/main/agent/compaction/contextPruner"

describe("ContextPruner", () => {
  it("should preserve recent messages without modification", () => {
    const longOutput = "line1\n".repeat(30)
    const messages: AgentMessage[] = [
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read",
        content: [{ type: "text", text: longOutput }],
        isError: false,
        timestamp: Date.now(),
      } as ToolResultMessage,
    ]

    // Keep 1 recent message -> will not prune
    const pruned = pruneHistoricalToolOutputs(messages, {
      recentMessagesToKeep: 1,
      lineThreshold: 20,
    })
    expect((pruned[0] as ToolResultMessage).content[0]).toEqual({ type: "text", text: longOutput })
  })

  it("should prune large outputs for historical read-only tool results", () => {
    const longOutput = "line1\n".repeat(30)
    const messages: AgentMessage[] = [
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read",
        content: [{ type: "text", text: longOutput }],
        isError: false,
        timestamp: Date.now(),
      } as ToolResultMessage,
      {
        role: "assistant",
        content: [{ type: "text", text: "next step" }],
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
        stopReason: "stop",
        timestamp: Date.now(),
      },
    ]

    const pruned = pruneHistoricalToolOutputs(messages, {
      recentMessagesToKeep: 1,
      lineThreshold: 20,
    })
    const toolMsg = pruned[0] as ToolResultMessage
    expect((toolMsg.content[0] as any).text).toContain('[Historical output of tool "read" pruned')
    expect((toolMsg.content[0] as any).text).toContain("31 lines")
  })

  it("should not prune non-prunable tools (e.g. edit/write/bash)", () => {
    const longOutput = "line1\n".repeat(30)
    const messages: AgentMessage[] = [
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "write",
        content: [{ type: "text", text: longOutput }],
        isError: false,
        timestamp: Date.now(),
      } as ToolResultMessage,
      {
        role: "assistant",
        content: [{ type: "text", text: "next step" }],
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
        stopReason: "stop",
        timestamp: Date.now(),
      },
    ]

    const pruned = pruneHistoricalToolOutputs(messages, {
      recentMessagesToKeep: 1,
      lineThreshold: 20,
    })
    const toolMsg = pruned[0] as ToolResultMessage
    expect((toolMsg.content[0] as any).text).toBe(longOutput)
  })

  it("should replace historical image blocks with a path placeholder", () => {
    const imageResult: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "call-img",
      toolName: "view_image",
      content: [
        { type: "text", text: "Viewed image /repo/shot.png" },
        { type: "image", data: "aW1n", mimeType: "image/png" },
      ],
      isError: false,
      timestamp: Date.now(),
      image: {
        path: "/repo/shot.png",
        mimeType: "image/png",
        detail: "high",
        width: 100,
        height: 50,
        sourceWidth: 100,
        sourceHeight: 50,
        resized: false,
        sizeBytes: 3,
      },
    }
    const assistantMsg: AgentMessage = {
      role: "assistant",
      content: [{ type: "text", text: "next step" }],
      provider: "anthropic",
      model: "claude-3-5-sonnet",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
      stopReason: "stop",
      timestamp: Date.now(),
    }

    const pruned = pruneHistoricalToolOutputs([imageResult, assistantMsg], {
      recentMessagesToKeep: 1,
    })
    const toolMsg = pruned[0] as ToolResultMessage
    expect(toolMsg.content[1]).toEqual({
      type: "text",
      text: "[Image omitted from historical context: /repo/shot.png]",
    })
    expect(toolMsg.content[0]).toEqual({ type: "text", text: "Viewed image /repo/shot.png" })
    // 原始消息不被污染。
    expect(imageResult.content[1]).toEqual({ type: "image", data: "aW1n", mimeType: "image/png" })
  })

  it("should keep image blocks within the recent window untouched", () => {
    const imageResult: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "call-img",
      toolName: "view_image",
      content: [{ type: "image", data: "aW1n", mimeType: "image/png" }],
      isError: false,
      timestamp: Date.now(),
    }

    const pruned = pruneHistoricalToolOutputs([imageResult], { recentMessagesToKeep: 1 })
    expect((pruned[0] as ToolResultMessage).content[0]).toEqual({
      type: "image",
      data: "aW1n",
      mimeType: "image/png",
    })
  })
})
