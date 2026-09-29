// @vitest-environment jsdom

import type { AgentDiff } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowList } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowList"
import type { ChatMessage } from "@/features/agent/types"

// jsdom ResizeObserver stub（气泡与折叠动画依赖）。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

// 构造展示用 diff。
const makeDiff = (fileName: string, added: number, removed: number): AgentDiff => ({
  fileName,
  lines: [{ type: "add", newLine: 3, text: "changed" }],
  truncated: false,
  stats: { added, removed },
})

// 用户消息。
const makeUserMessage = (): ChatMessage => ({
  id: "user-1",
  role: "user",
  blocks: [{ kind: "text", text: "修改文件" }],
  isStreaming: false,
  timestamp: 1000,
})

// 含一次写工具调用的助手消息。
const makeEditAssistantMessage = (id: string): ChatMessage => ({
  id,
  role: "assistant",
  model: "gpt-4o",
  blocks: [
    {
      kind: "toolCall",
      toolCallId: `tc-${id}`,
      toolName: "edit",
      args: { filePath: "src/a.ts" },
      status: "done",
    },
    {
      kind: "toolResult",
      toolCallId: `tc-${id}`,
      toolName: "edit",
      text: "ok",
      isError: false,
      diff: makeDiff("src/a.ts", 10, 2),
    },
  ],
  isStreaming: false,
  timestamp: 2000,
})

describe("AgentExecutionFlowList 文件修改统计", () => {
  beforeEach(() => {
    cleanup()
  })

  it("每轮文件修改汇总渲染在该轮最后一个步骤之后，而非步骤内部", () => {
    const finalMessage: ChatMessage = {
      id: "assistant-final",
      role: "assistant",
      model: "gpt-4o",
      blocks: [{ kind: "text", text: "修改完成" }],
      isStreaming: false,
      timestamp: 3000,
    }

    render(
      <AgentExecutionFlowList
        messages={[makeUserMessage(), makeEditAssistantMessage("assistant-1"), finalMessage]}
        isStreaming={false}
      />,
    )

    // 一轮只渲染一张汇总卡片，且位于最后一个步骤（收尾 assistant）之后。
    const cards = document.querySelectorAll('[data-testid="file-changes-card"]')
    expect(cards.length).toBe(1)
    const wrapper = document.querySelector(".agent-execution-flow-file-changes")
    expect(wrapper).not.toBeNull()
    expect(wrapper?.closest(".agent-execution-flow-step")).toBeNull()

    const stepElements = document.querySelectorAll(".agent-execution-flow-step")
    expect(stepElements.length).toBeGreaterThan(0)
    const lastStep = stepElements[stepElements.length - 1]
    expect(
      lastStep.compareDocumentPosition(wrapper as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it("无文件修改的轮次不渲染卡片", () => {
    const plainAssistant: ChatMessage = {
      id: "assistant-1",
      role: "assistant",
      model: "gpt-4o",
      blocks: [{ kind: "text", text: "没有改动" }],
      isStreaming: false,
      timestamp: 2000,
    }

    render(
      <AgentExecutionFlowList messages={[makeUserMessage(), plainAssistant]} isStreaming={false} />,
    )

    expect(screen.queryByTestId("file-changes-card")).toBeNull()
  })

  it("用户步骤时间戳贯通为文件回退上下文", () => {
    render(
      <AgentExecutionFlowList
        messages={[makeUserMessage(), makeEditAssistantMessage("assistant-1")]}
        isStreaming={false}
        sessionId="session-1"
      />,
    )

    expect(screen.getByTestId("file-changes-card")).not.toBeNull()
    fireEvent.click(screen.getByText("1 file changed"))
    expect(document.querySelector(".agent-file-changes-revert")).not.toBeNull()
  })
})
