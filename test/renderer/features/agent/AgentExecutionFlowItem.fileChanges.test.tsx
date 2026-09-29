// @vitest-environment jsdom

import type { AgentDiff } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowItem } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowItem"
import { AgentExecutionFlowList } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowList"
import type { ChatMessage, ExecutionStep } from "@/features/agent/types"
import type { FileChangeSummary } from "@/features/agent/utils/fileChanges"

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

// 构造该轮文件修改汇总。
const makeSummary = (): FileChangeSummary => ({
  files: [{ filePath: "src/a.ts", added: 10, removed: 2, line: 42 }],
  totalAdded: 10,
  totalRemoved: 2,
})

// 构造助手回复步骤。
const makeAssistantStep = (): ExecutionStep => ({
  id: "step-assistant",
  turnIndex: 1,
  stepIndex: 3,
  kind: "assistant",
  title: "assistant",
  status: "done",
  assistantContent: { text: "修改完成" },
})

describe("AgentExecutionFlowItem 文件修改统计", () => {
  beforeEach(() => {
    cleanup()
  })

  it("assistant 步骤展开区底部展示该轮文件修改汇总", () => {
    render(
      <AgentExecutionFlowItem
        step={makeAssistantStep()}
        isExpanded
        onToggleExpand={vi.fn()}
        fileChanges={makeSummary()}
      />,
    )

    expect(screen.getByTestId("file-changes-card")).not.toBeNull()
    expect(screen.getByText("1 file changed")).not.toBeNull()
    expect(document.querySelector(".agent-execution-flow-file-changes")).not.toBeNull()
  })

  it("未提供汇总时不渲染卡片", () => {
    render(
      <AgentExecutionFlowItem step={makeAssistantStep()} isExpanded onToggleExpand={vi.fn()} />,
    )

    expect(screen.queryByTestId("file-changes-card")).toBeNull()
  })

  it("提供会话与用户消息时间戳时卡片提供回退按钮", () => {
    render(
      <AgentExecutionFlowItem
        step={makeAssistantStep()}
        isExpanded
        onToggleExpand={vi.fn()}
        fileChanges={makeSummary()}
        sessionId="session-1"
        fileChangesUserMessageTimestamp={1000}
      />,
    )

    fireEvent.click(screen.getByText("1 file changed"))
    expect(document.querySelector(".agent-file-changes-revert")).not.toBeNull()
  })
})

describe("AgentExecutionFlowList 文件修改统计", () => {
  beforeEach(() => {
    cleanup()
  })

  it("按轮次聚合写工具 diff 并挂在 assistant 步骤", () => {
    const messages: ChatMessage[] = [
      {
        id: "user-1",
        role: "user",
        blocks: [{ kind: "text", text: "修改文件" }],
        isStreaming: false,
        timestamp: 1000,
      },
      {
        id: "assistant-1",
        role: "assistant",
        model: "gpt-4o",
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "tc-1",
            toolName: "edit",
            args: { filePath: "src/a.ts" },
            status: "done",
          },
          {
            kind: "toolResult",
            toolCallId: "tc-1",
            toolName: "edit",
            text: "ok",
            isError: false,
            diff: makeDiff("src/a.ts", 10, 2),
          },
          { kind: "text", text: "修改完成" },
        ],
        isStreaming: false,
        timestamp: 2000,
      },
    ]

    render(<AgentExecutionFlowList messages={messages} isStreaming={false} />)

    expect(screen.getByTestId("file-changes-card")).not.toBeNull()
    expect(screen.getByText("1 file changed")).not.toBeNull()
  })

  it("用户步骤时间戳贯通为文件回退上下文", () => {
    const messages: ChatMessage[] = [
      {
        id: "user-1",
        role: "user",
        blocks: [{ kind: "text", text: "修改文件" }],
        isStreaming: false,
        timestamp: 1000,
      },
      {
        id: "assistant-1",
        role: "assistant",
        model: "gpt-4o",
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "tc-1",
            toolName: "edit",
            args: { filePath: "src/a.ts" },
            status: "done",
          },
          {
            kind: "toolResult",
            toolCallId: "tc-1",
            toolName: "edit",
            text: "ok",
            isError: false,
            diff: makeDiff("src/a.ts", 10, 2),
          },
          { kind: "text", text: "修改完成" },
        ],
        isStreaming: false,
        timestamp: 2000,
      },
    ]

    render(<AgentExecutionFlowList messages={messages} isStreaming={false} sessionId="session-1" />)

    fireEvent.click(screen.getByText("1 file changed"))
    expect(document.querySelector(".agent-file-changes-revert")).not.toBeNull()
  })
})
