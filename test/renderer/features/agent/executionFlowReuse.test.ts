import { describe, expect, it } from "vitest"
import { buildExecutionSteps, reuseExecutionSteps } from "@/features/agent/executionFlow"
import type { ChatBlock, ChatMessage } from "@/features/agent/types"

const userMessage = (id: string, text: string): ChatMessage => ({
  id,
  role: "user",
  blocks: [{ kind: "text", text }],
  isStreaming: false,
  timestamp: 1000,
})

const assistantMessage = (id: string, blocks: ChatBlock[], isStreaming = true): ChatMessage => ({
  id,
  role: "assistant",
  blocks,
  isStreaming,
  timestamp: 2000,
  model: "model-x",
  provider: "provider-x",
})

const textBlock = (text: string): ChatBlock => ({ kind: "text", text })

const toolCallBlock = (toolCallId: string, args: Record<string, unknown>): ChatBlock => ({
  kind: "toolCall",
  toolCallId,
  toolName: "read",
  args,
  status: "done",
})

describe("reuseExecutionSteps 步骤对象引用复用", () => {
  it("消息未变化时返回上一轮步骤数组本身", () => {
    const messages = [userMessage("u1", "问题"), assistantMessage("a1", [textBlock("答案")])]
    const first = buildExecutionSteps(messages)
    const next = buildExecutionSteps(messages)

    expect(reuseExecutionSteps(next, first)).toBe(first)
  })

  it("仅流式助手消息变化时，其余步骤保持原对象引用", () => {
    const messages = [userMessage("u1", "问题"), assistantMessage("a1", [textBlock("答案 v1")])]
    const first = buildExecutionSteps(messages)

    const streamingMessage = messages[1]
    const updatedMessages = [messages[0], { ...streamingMessage, blocks: [textBlock("答案 v2")] }]
    const reused = reuseExecutionSteps(buildExecutionSteps(updatedMessages), first)

    const firstUserStep = first.find((step) => step.kind === "user")
    const reusedUserStep = reused.find((step) => step.kind === "user")
    expect(reusedUserStep).toBe(firstUserStep)

    const firstAssistantStep = first.find((step) => step.kind === "assistant")
    const reusedAssistantStep = reused.find((step) => step.kind === "assistant")
    expect(reusedAssistantStep).not.toBe(firstAssistantStep)
    expect(reusedAssistantStep?.assistantContent?.text).toBe("答案 v2")
  })

  it("追加新消息时历史步骤按 id 复用（数组长度变化）", () => {
    const messages = [userMessage("u1", "第一问"), assistantMessage("a1", [textBlock("第一答")])]
    const first = buildExecutionSteps(messages)

    const extended = [...messages, userMessage("u2", "第二问")]
    const reused = reuseExecutionSteps(buildExecutionSteps(extended), first)

    expect(reused.length).toBeGreaterThan(first.length)
    expect(reused[0]).toBe(first[0])
    expect(reused[1]).toBe(first[1])
  })

  it("深层内容对象变化（工具参数）时仅该步骤换引用", () => {
    const messages = [
      userMessage("u1", "问题"),
      assistantMessage("a1", [toolCallBlock("call-1", { pattern: "alpha" })], false),
    ]
    const first = buildExecutionSteps(messages)

    const streamingMessage = messages[1]
    const updatedMessages = [
      messages[0],
      {
        ...streamingMessage,
        blocks: [toolCallBlock("call-1", { pattern: "beta" })],
      },
    ]
    const reused = reuseExecutionSteps(buildExecutionSteps(updatedMessages), first)

    const firstToolStep = first.find((step) => step.kind === "tool")
    const reusedToolStep = reused.find((step) => step.kind === "tool")
    expect(reusedToolStep).not.toBe(firstToolStep)
    expect(reusedToolStep?.toolContent?.args).toEqual({ pattern: "beta" })

    const firstUserStep = first.find((step) => step.kind === "user")
    expect(reused.find((step) => step.kind === "user")).toBe(firstUserStep)
  })
})
