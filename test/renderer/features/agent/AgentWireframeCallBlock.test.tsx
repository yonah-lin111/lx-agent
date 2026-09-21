// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentMessageItem } from "@/features/agent/components/AgentMessageList"
import { AgentWireframeCallBlock } from "@/features/agent/components/blocks"
import type { ChatBlock, ChatMessage } from "@/features/agent/types"

describe("AgentWireframeCallBlock", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("renders wireframe title, description, and ascii layout", () => {
    const layout = "┌────────┐\n│ Panel  │\n└────────┘"
    const toolCall: Extract<ChatBlock, { kind: "toolCall" }> = {
      kind: "toolCall",
      toolCallId: "call-wf-1",
      toolName: "wireframe",
      args: {
        name: "Main Dashboard",
        description: "Dashboard layout with sidebar",
        layout,
      },
      status: "done",
    }

    render(<AgentWireframeCallBlock toolCall={toolCall} />)

    expect(screen.getByText("Wireframe")).not.toBeNull()
    expect(screen.getByText("Wireframe").className).toContain("text-amber-300")
    expect(screen.getByText("Main Dashboard")).not.toBeNull()
    expect(screen.getByText("Dashboard layout with sidebar")).not.toBeNull()
    expect(screen.getByText((content) => content.includes("Panel"))).not.toBeNull()
  })

  it("兼容历史消息中的 title 参数（参数已改名 name）", () => {
    const layout = "┌────────┐\n│ Legacy │\n└────────┘"
    const toolCall: Extract<ChatBlock, { kind: "toolCall" }> = {
      kind: "toolCall",
      toolCallId: "call-wf-legacy",
      toolName: "wireframe",
      args: {
        title: "Legacy Dashboard",
        layout,
      },
      status: "done",
    }

    render(<AgentWireframeCallBlock toolCall={toolCall} />)

    expect(screen.getByText("Legacy Dashboard")).not.toBeNull()
    expect(screen.getAllByText((content) => content.includes("Legacy")).length).toBeGreaterThan(0)
  })

  it("copies layout on copy button click", async () => {
    const layout = "┌─┐\n└─┘"
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    })

    const toolCall: Extract<ChatBlock, { kind: "toolCall" }> = {
      kind: "toolCall",
      toolCallId: "call-wf-2",
      toolName: "wireframe",
      args: { name: "Box", layout },
      status: "done",
    }

    render(<AgentWireframeCallBlock toolCall={toolCall} />)
    const copyBtn = screen.getByRole("button", { name: /Copy Wireframe|复制字符画/i })
    fireEvent.click(copyBtn)

    expect(writeTextMock).toHaveBeenCalledWith(layout)
  })

  it("does not get folded into Execute Group in AgentMessageItem", () => {
    const layout = "┌────────┐\n│ Widget │\n└────────┘"
    const message: ChatMessage = {
      id: "msg-wf-1",
      role: "assistant",
      blocks: [
        { kind: "text", text: "Here is the wireframe:" },
        {
          kind: "toolCall",
          toolCallId: "call-wf-3",
          toolName: "wireframe",
          args: { name: "Widget Card", layout },
          status: "done",
        },
      ],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} />)

    // Execute Group should NOT be present
    expect(screen.queryByText("Execute Group")).toBeNull()
    // Wireframe title and layout should be directly rendered
    expect(screen.getByText("Widget Card")).not.toBeNull()
    expect(screen.getAllByText((content) => content.includes("Widget")).length).toBeGreaterThan(0)
  })

  it("hides layout and shows the error line when the paired tool result failed", () => {
    const layout = "┌────────┐\n│ Panel  │\n└────────┘"
    const toolCall: Extract<ChatBlock, { kind: "toolCall" }> = {
      kind: "toolCall",
      toolCallId: "call-wf-err",
      toolName: "wireframe",
      args: { description: "Dashboard layout", layout },
      status: "error",
    }
    const toolResult: Extract<ChatBlock, { kind: "toolResult" }> = {
      kind: "toolResult",
      toolCallId: "call-wf-err",
      toolName: "wireframe",
      text: `Validation failed for tool "wireframe":
  - title: Invalid input: expected string, received undefined

Received arguments:
{
  "description": "Dashboard layout",
  "layout": ${JSON.stringify(layout)}
}`,
      isError: true,
    }

    render(<AgentWireframeCallBlock toolCall={toolCall} toolResult={toolResult} />)

    expect(screen.getByText(/Validation failed for tool/)).not.toBeNull()
    expect(screen.getByText(/Invalid input: expected string/)).not.toBeNull()
    // 失败时不得渲染描述、字符画、原始参数回显与复制按钮
    expect(screen.queryByText("Dashboard layout")).toBeNull()
    expect(screen.queryByText((content) => content.includes("Panel"))).toBeNull()
    expect(screen.queryByText(/Received arguments/)).toBeNull()
    expect(screen.queryByRole("button", { name: /Copy Wireframe|复制字符画/i })).toBeNull()
  })

  it("failed wireframe tool result hides layout inside AgentMessageItem", () => {
    const layout = "┌────────┐\n│ Widget │\n└────────┘"
    const message: ChatMessage = {
      id: "msg-wf-err",
      role: "assistant",
      blocks: [
        {
          kind: "toolCall",
          toolCallId: "call-wf-err-2",
          toolName: "wireframe",
          args: { description: "Dashboard layout", layout },
          status: "error",
        },
      ],
      isStreaming: false,
    }
    const continuation: ChatMessage = {
      id: "msg-wf-err-result",
      role: "toolResult",
      blocks: [
        {
          kind: "toolResult",
          toolCallId: "call-wf-err-2",
          toolName: "wireframe",
          text: `Validation failed for tool "wireframe":
  - title: Invalid input: expected string, received undefined

Received arguments:
{
  "description": "Dashboard layout",
  "layout": ${JSON.stringify(layout)}
}`,
          isError: true,
        },
      ],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} continuationMessages={[continuation]} />)

    expect(screen.getByText(/Validation failed for tool/)).not.toBeNull()
    expect(screen.queryByText("Dashboard layout")).toBeNull()
    expect(screen.queryByText((content) => content.includes("Widget"))).toBeNull()
    expect(screen.queryByText(/Received arguments/)).toBeNull()
  })
})
