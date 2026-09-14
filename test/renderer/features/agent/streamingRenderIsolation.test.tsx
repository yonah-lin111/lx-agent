// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react"
import type React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ChatBlock, ChatMessage } from "@/features/agent/types"

// 渲染计数：memo 未命中时才会走到被包装的真实组件。
const { messageItemRenders, flowItemRenders } = vi.hoisted(() => ({
  messageItemRenders: [] as string[],
  flowItemRenders: [] as string[],
}))

vi.mock(
  "@/features/agent/components/AgentMessageList/AgentMessageItem/AgentMessageItem",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/features/agent/components/AgentMessageList/AgentMessageItem/AgentMessageItem")
      >()
    const CountingAgentMessageItem = (
      props: Parameters<typeof actual.AgentMessageItem>[0],
    ): React.JSX.Element => {
      messageItemRenders.push(props.message.id)
      return actual.AgentMessageItem(props)
    }
    return { ...actual, AgentMessageItem: CountingAgentMessageItem }
  },
)

vi.mock(
  "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowItem",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowItem")
      >()
    const CountingFlowItem = (
      props: Parameters<typeof actual.AgentExecutionFlowItem>[0],
    ): React.JSX.Element => {
      flowItemRenders.push(props.step.id)
      return actual.AgentExecutionFlowItem(props)
    }
    return { ...actual, AgentExecutionFlowItem: CountingFlowItem }
  },
)

import { agentApi } from "@/features/agent/api/agentApi"
import { AgentExecutionFlowList } from "@/features/agent/components/AgentExecutionFlowList"
import { AgentMessageList } from "@/features/agent/components/AgentMessageList"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const textBlock = (text: string): ChatBlock => ({ kind: "text", text })

const userMessage = (id: string, text: string): ChatMessage => ({
  id,
  role: "user",
  blocks: [textBlock(text)],
  isStreaming: false,
  timestamp: 1000,
})

const assistantMessage = (id: string, text: string, isStreaming: boolean): ChatMessage => ({
  id,
  role: "assistant",
  blocks: [textBlock(text)],
  isStreaming,
  timestamp: 2000,
  model: "model-x",
  provider: "provider-x",
})

const toolResultMessage = (id: string, toolCallId: string): ChatMessage => ({
  id,
  role: "toolResult",
  blocks: [
    {
      kind: "toolResult",
      toolCallId,
      toolName: "read",
      text: "工具输出",
      isError: false,
    },
  ],
  isStreaming: false,
  timestamp: 1500,
})

const baseMessages = (streamingText: string): ChatMessage[] => [
  userMessage("u1", "第一问"),
  assistantMessage("a1", "第一答 STABLE_ANSWER", false),
  toolResultMessage("t1", "call-1"),
  userMessage("u2", "第二问"),
  assistantMessage("a2", streamingText, true),
]

describe("流式渲染隔离", () => {
  afterEach(() => {
    cleanup()
    messageItemRenders.length = 0
    flowItemRenders.length = 0
  })

  it("AgentMessageList：仅流式消息条目重渲染，其余条目命中 memo", () => {
    const onSelectPrompt = vi.fn()
    const messages = baseMessages("流式 v1")
    const { rerender } = render(
      <AgentMessageList messages={messages} onSelectPrompt={onSelectPrompt} />,
    )

    expect(messageItemRenders).toEqual(["u1", "a1", "u2", "a2"])
    messageItemRenders.length = 0

    // 仅替换流式消息对象，其余消息保持原引用（与 useAgentChat 的更新方式一致）。
    const nextMessages = messages.map((message) =>
      message.id === "a2" ? { ...message, blocks: [textBlock("流式 v2")] } : message,
    )
    rerender(<AgentMessageList messages={nextMessages} onSelectPrompt={onSelectPrompt} />)

    expect(messageItemRenders).toEqual(["a2"])
  })

  it("AgentExecutionFlowList：仅流式助手步骤重渲染，未变化步骤命中 memo", async () => {
    vi.spyOn(agentApi, "getPromptAssembly").mockRejectedValue(new Error("prompt assembly skipped"))

    const onSelectPrompt = vi.fn()
    const messages = [userMessage("u1", "第一问"), assistantMessage("a1", "第一答", true)]
    const { rerender } = render(
      <AgentExecutionFlowList messages={messages} onSelectPrompt={onSelectPrompt} />,
    )

    // 首次渲染：用户步骤 + 助手步骤。
    expect(flowItemRenders).toEqual(["step-0-user", "step-1-assistant"])
    flowItemRenders.length = 0

    // 仅替换流式助手消息对象，用户消息保持原引用。
    const nextMessages = [
      messages[0],
      { ...messages[1], blocks: [textBlock("第二答（流式推进）")] },
    ]
    rerender(<AgentExecutionFlowList messages={nextMessages} onSelectPrompt={onSelectPrompt} />)

    expect(flowItemRenders).toEqual(["step-1-assistant"])
  })
})
