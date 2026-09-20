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
        title: "Main Dashboard",
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
      args: { title: "Box", layout },
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
          args: { title: "Widget Card", layout },
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
})
