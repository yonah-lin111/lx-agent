// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AgentModelSelect } from "@/features/agent/components/AgentModelSelect"
import { AgentMessageItem } from "@/features/agent/components/AgentMessageList"
import { AgentExecutionFlowList } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowList"
import type { ChatMessage } from "@/features/agent/types"

// jsdom ResizeObserver stub
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

describe("Thinking Variants Display & Components", () => {
  beforeEach(() => {
    cleanup()
  })

  it("AgentModelSelect 应该在存在 variants 时渲染思考等级选择器", () => {
    const onVariantChange = vi.fn()
    const { rerender } = render(
      <AgentModelSelect
        value="openai::gpt-4o"
        onChange={vi.fn()}
        options={[{ value: "openai::gpt-4o", label: "GPT-4o" }]}
      />,
    )

    // 未传入 variants 时不显示思考等级选择下拉
    expect(screen.queryByText("high")).toBeNull()

    // 传入 variants 与 onVariantChange 时正确渲染
    rerender(
      <AgentModelSelect
        value="openai::gpt-4o"
        onChange={vi.fn()}
        options={[{ value: "openai::gpt-4o", label: "GPT-4o" }]}
        variant="high"
        variants={["low", "medium", "high"]}
        onVariantChange={onVariantChange}
      />,
    )

    expect(screen.getByText("high")).not.toBeNull()
  })

  it("AgentMessageItem 应该在 turn 底部显示思考等级", () => {
    const message: ChatMessage = {
      id: "msg-1",
      role: "assistant",
      model: "gpt-4o",
      variant: "xhigh",
      blocks: [{ kind: "text", text: "Here is the response" }],
      isStreaming: false,
    }

    render(
      <AgentMessageItem
        message={message}
        continuationMessages={[]}
      />,
    )

    expect(screen.getByText("variant:")).not.toBeNull()
    expect(screen.getByText("xhigh")).not.toBeNull()
  })

  it("AgentExecutionFlowList 应该在 turn 底部统计栏显示思考等级", () => {
    const messages: ChatMessage[] = [
      {
        id: "msg-user-1",
        role: "user",
        blocks: [{ kind: "text", text: "Run test" }],
        isStreaming: false,
        timestamp: 1000,
      },
      {
        id: "msg-assistant-1",
        role: "assistant",
        model: "gpt-4o",
        variant: "high",
        blocks: [
          { kind: "thinking", text: "Thinking deep..." },
          { kind: "text", text: "Completed task." },
        ],
        isStreaming: false,
        timestamp: 2000,
      },
    ]

    render(
      <AgentExecutionFlowList
        messages={messages}
        isStreaming={false}
      />,
    )

    // 验证 turn summary 中存在 model 和 variant
    expect(screen.getByText("high")).not.toBeNull()
  })
})
