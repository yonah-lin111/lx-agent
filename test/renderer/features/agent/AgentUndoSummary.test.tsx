// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AgentMessageItem } from "@/features/agent/components/AgentMessageList"
import { AgentUndoSummary } from "@/features/agent/components/blocks/AgentUndoSummary"
import type { ChatMessage } from "@/features/agent/types"

// jsdom ResizeObserver mock
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

describe("AgentUndoSummary", () => {
  beforeEach(() => {
    cleanup()
  })

  it("正确渲染折叠态与指标统计", () => {
    const payload = {
      userPrompt: "编写排序函数",
      modelName: "claude-3-7-sonnet",
      undoneAt: 1700000000000,
      toolCallCount: 2,
      fileChangeCount: 1,
      toolCalls: [
        { toolName: "read", summary: "src/sort.ts" },
        { toolName: "edit", summary: "src/sort.ts" },
      ],
      diffs: [
        {
          filePath: "src/sort.ts",
          diff: {
            filePath: "src/sort.ts",
            stats: { added: 5, removed: 2 },
            lines: [
              { type: "context" as const, text: "function sort() {", newLine: 1, oldLine: 1 },
              { type: "del" as const, text: "- return []", oldLine: 2 },
              { type: "add" as const, text: "+ return arr.sort()", newLine: 2 },
            ],
          },
        },
      ],
    }

    render(<AgentUndoSummary payload={payload} />)

    // 默认展示标题与折叠按钮
    const toggleButton = screen.getByRole("button")
    expect(toggleButton).not.toBeNull()
    expect(screen.getByText("MODEL claude-3-7-sonnet")).not.toBeNull()

    // 点击展开
    fireEvent.click(toggleButton)
    expect(screen.getAllByText("src/sort.ts").length).toBeGreaterThan(0)
    expect(screen.getByText("+5")).not.toBeNull()
    expect(screen.getByText("−2")).not.toBeNull()
  })

  it("通过 AgentMessageItem 成功分发 undoSummary role", () => {
    const message: ChatMessage = {
      id: "undo-msg-1",
      role: "undoSummary",
      isStreaming: false,
      blocks: [{ kind: "text", text: "撤销测试" }],
      undoPayload: {
        userPrompt: "被撤销的提示词",
        toolCallCount: 1,
        fileChangeCount: 0,
        toolCalls: [{ toolName: "bash", summary: "npm test" }],
      },
    }

    render(<AgentMessageItem message={message} />)

    const toggleButton = screen.getByRole("button")
    expect(toggleButton).not.toBeNull()

    fireEvent.click(toggleButton)
    expect(screen.getByText("bash")).not.toBeNull()
    expect(screen.getByText("npm test")).not.toBeNull()
  })

  it("支持多轮撤销连续堆叠合并展示", () => {
    const message1: ChatMessage = {
      id: "undo-msg-1",
      role: "undoSummary",
      isStreaming: false,
      blocks: [],
      undoPayload: {
        userPrompt: "第一轮问题",
        toolCallCount: 1,
        toolCalls: [{ toolName: "read", summary: "file1.ts" }],
      },
    }

    const message2: ChatMessage = {
      id: "undo-msg-2",
      role: "undoSummary",
      isStreaming: false,
      blocks: [],
      undoPayload: {
        userPrompt: "第二轮问题",
        toolCallCount: 2,
        toolCalls: [{ toolName: "edit", summary: "file2.ts" }],
      },
    }

    render(<AgentMessageItem message={message1} continuationMessages={[message2]} />)

    // 应展示 2 轮撤销标题与总数 2 次调用
    expect(screen.getByText("2 turns and operations undone")).not.toBeNull()
    expect(screen.getByText("2 calls")).not.toBeNull()

    const toggleButton = screen.getByRole("button")
    fireEvent.click(toggleButton)

    expect(screen.getByText("#1")).not.toBeNull()
    expect(screen.getByText("#2")).not.toBeNull()
    expect(screen.getByText("第一轮问题")).not.toBeNull()
    expect(screen.getByText("第二轮问题")).not.toBeNull()
  })
})
