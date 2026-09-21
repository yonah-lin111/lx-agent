// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowItem } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowItem"
import { FlowToolWireframe } from "@/features/agent/components/AgentExecutionFlowList/tools/FlowToolWireframe"
import type { ExecutionStep, ExecutionToolContent } from "@/features/agent/types"

describe("FlowToolWireframe", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("renders wireframe title, description, and ascii layout", () => {
    const layout = [
      "┌──────────────────────────────┐",
      "│  Header                      │",
      "├──────────────────────────────┤",
      "│  Content                     │",
      "└──────────────────────────────┘",
    ].join("\n")

    const toolContent: ExecutionToolContent = {
      toolName: "wireframe",
      args: {
        name: "User Profile Card",
        description: "Layout for user info and actions",
        layout,
      },
      durationMs: 45,
    }

    render(<FlowToolWireframe content={toolContent} />)

    // Check title and description
    expect(screen.getByText("User Profile Card")).not.toBeNull()
    expect(screen.getByText("Layout for user info and actions")).not.toBeNull()

    // Check ASCII layout content
    expect(
      screen.getByText((content) => content.includes("Header") && content.includes("Content")),
    ).not.toBeNull()

    // Check duration
    expect(screen.getByText("45ms")).not.toBeNull()
  })

  it("copies layout to clipboard when copy button is clicked", async () => {
    const layout = "┌─┐\n└─┘"
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    const toolContent: ExecutionToolContent = {
      toolName: "wireframe",
      args: {
        name: "Box",
        layout,
      },
    }

    render(<FlowToolWireframe content={toolContent} />)

    const copyBtn = screen.getByRole("button", { name: /Copy Wireframe|复制字符画/i })
    fireEvent.click(copyBtn)

    expect(writeTextMock).toHaveBeenCalledWith(layout)
  })

  it("renders fallback text when layout is empty", () => {
    const toolContent: ExecutionToolContent = {
      toolName: "wireframe",
      args: {
        name: "Empty Wireframe",
        layout: "",
      },
    }

    render(<FlowToolWireframe content={toolContent} />)
    expect(screen.getByText(/No wireframe content|暂无线框图内容/i)).not.toBeNull()
  })

  it("renders only the error line and hides the layout when the call failed", () => {
    const layout = "┌──────────┐\n│ Card     │\n└──────────┘"
    const toolContent: ExecutionToolContent = {
      toolName: "wireframe",
      args: {
        description: "Dashboard layout",
        layout,
      },
      result:
        'Validation failed for tool "wireframe":\n  - title: Invalid input: expected string, received undefined',
      isError: true,
      durationMs: 11,
    }

    render(<FlowToolWireframe content={toolContent} />)

    expect(screen.getByText(/Validation failed for tool/)).not.toBeNull()
    // 失败时不得渲染参数中的描述与字符画
    expect(screen.queryByText("Dashboard layout")).toBeNull()
    expect(screen.queryByText((content) => content.includes("Card"))).toBeNull()
  })

  it("AgentExecutionFlowItem renders wireframe tool step with body styling and title", () => {
    const layout = "┌──────────┐\n│ Card     │\n└──────────┘"
    const step: ExecutionStep = {
      id: "step-wireframe-1",
      stepIndex: 2,
      turnIndex: 0,
      kind: "tool",
      title: "wireframe",
      status: "done",
      toolContent: {
        toolName: "wireframe",
        args: {
          name: "Card Layout",
          layout,
        },
      },
    }

    render(<AgentExecutionFlowItem step={step} isExpanded={true} onToggleExpand={() => {}} />)

    // Title area should contain wireframe and title
    expect(screen.getAllByText("wireframe").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Card Layout").length).toBeGreaterThan(0)

    // Contains the dedicated indigo body style class
    expect(document.querySelector(".agent-execution-flow-step-body--wireframe")).not.toBeNull()
  })
})
