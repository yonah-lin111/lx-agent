import { describe, expect, it } from "vitest"
import { buildExecutionSteps } from "@/features/agent/executionFlow"
import { groupAgentMessages } from "@/features/agent/messageGrouping"
import type { ChatMessage } from "@/features/agent/types"
import { toAgentMessages, toChatMessage } from "@/features/agent/utils"

const hookChat = (
  partial: Partial<ChatMessage> & Pick<ChatMessage, "id" | "hookStatus">,
): ChatMessage => ({
  role: "hookContext",
  blocks: [],
  isStreaming: false,
  timestamp: 1000,
  hookEvent: "PreToolUse",
  hookName: "policy",
  ...partial,
})

describe("hookContext 呈现映射", () => {
  it("toChatMessage 映射 hook 元数据，空 text 不产生文本块", () => {
    const chat = toChatMessage(
      {
        role: "hookContext",
        event: "PreToolUse",
        hookName: "policy",
        status: "blocked",
        text: "denied by policy",
        durationMs: 7,
        timestamp: 42,
      },
      false,
      "m1",
    )
    expect(chat).toMatchObject({
      id: "m1",
      role: "hookContext",
      hookEvent: "PreToolUse",
      hookName: "policy",
      hookStatus: "blocked",
      durationMs: 7,
      timestamp: 42,
    })
    expect(chat.blocks).toEqual([{ kind: "text", text: "denied by policy" }])

    const empty = toChatMessage(
      {
        role: "hookContext",
        event: "Stop",
        hookName: "audit",
        status: "completed",
        text: "",
        timestamp: 43,
      },
      false,
      "m2",
    )
    expect(empty.blocks).toEqual([])
  })

  it("toAgentMessages 回传 hookContext（保留时间戳）", () => {
    const messages = toAgentMessages([
      hookChat({
        id: "m1",
        hookStatus: "completed",
        blocks: [{ kind: "text", text: "ctx" }],
        timestamp: 123,
      }),
    ])
    expect(messages).toEqual([
      {
        role: "hookContext",
        event: "PreToolUse",
        hookName: "policy",
        status: "completed",
        text: "ctx",
        timestamp: 123,
      },
    ])
  })

  it("MsgList 分组显式排除 hookContext（不进入 QA 分组）", () => {
    const user: ChatMessage = {
      id: "u",
      role: "user",
      blocks: [{ kind: "text", text: "q" }],
      isStreaming: false,
    }
    const assistant: ChatMessage = {
      id: "a",
      role: "assistant",
      blocks: [{ kind: "text", text: "a" }],
      isStreaming: false,
    }
    const entries = groupAgentMessages([
      user,
      hookChat({ id: "h1", hookStatus: "completed" }),
      assistant,
      hookChat({ id: "h2", hookStatus: "failed" }),
    ])
    expect(entries.map((entry) => entry.message.id)).toEqual(["u", "a"])
    expect(entries[1].continuationMessages).toEqual([])
  })
})

describe("executionFlow hook 步骤", () => {
  it("completed → done；failed/blocked → error；空 text 仍生成步骤", () => {
    const steps = buildExecutionSteps([
      hookChat({
        id: "h1",
        hookStatus: "completed",
        blocks: [{ kind: "text", text: "pre context" }],
      }),
      hookChat({ id: "h2", hookStatus: "failed", hookEvent: "PostToolUse" }),
      hookChat({
        id: "h3",
        hookStatus: "blocked",
        blocks: [{ kind: "text", text: "denied" }],
      }),
    ])

    expect(steps.map((step) => step.kind)).toEqual(["hook", "hook", "hook"])
    expect(steps.map((step) => step.status)).toEqual(["done", "error", "error"])
    expect(steps[0]).toMatchObject({
      title: "policy",
      subtitle: "PreToolUse · completed",
      durationMs: undefined,
      hookContent: {
        event: "PreToolUse",
        hookName: "policy",
        status: "completed",
        text: "pre context",
      },
    })
    expect(steps[1]).toMatchObject({
      subtitle: "PostToolUse · failed",
      hookContent: { text: "" },
    })
    expect(steps[2]).toMatchObject({ status: "error", hookContent: { text: "denied" } })
  })

  it("hook 步骤跟随用户轮次（Pre/Post 在工具结果之后）", () => {
    const user: ChatMessage = {
      id: "u",
      role: "user",
      blocks: [{ kind: "text", text: "run" }],
      isStreaming: false,
      timestamp: 1,
    }
    const assistant: ChatMessage = {
      id: "a",
      role: "assistant",
      blocks: [
        {
          kind: "toolCall",
          toolCallId: "c1",
          toolName: "time",
          args: {},
          status: "done",
        },
      ],
      isStreaming: false,
      timestamp: 2,
    }
    const toolResult: ChatMessage = {
      id: "t",
      role: "toolResult",
      blocks: [
        { kind: "toolResult", toolCallId: "c1", toolName: "time", text: "now", isError: false },
      ],
      isStreaming: false,
      timestamp: 3,
    }
    const steps = buildExecutionSteps([
      user,
      assistant,
      toolResult,
      hookChat({ id: "hp1", hookStatus: "completed" }),
      hookChat({ id: "hp2", hookStatus: "completed", hookEvent: "PostToolUse" }),
    ])
    expect(steps.map((step) => step.kind)).toEqual(["user", "tool", "hook", "hook"])
    expect(steps.filter((step) => step.kind === "hook").map((step) => step.turnIndex)).toEqual([
      1, 1,
    ])
  })
})
