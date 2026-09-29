// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    openFileAt: vi.fn(() => Promise.resolve({ ok: true })),
  },
}))

import type { AgentDiff } from "@shared/contracts/agent"
import { agentApi } from "@/features/agent/api/agentApi"
import { AgentMessageItem } from "@/features/agent/components/AgentMessageList"
import type { ChatMessage } from "@/features/agent/types"

// jsdom ResizeObserver stub（Tooltip 与折叠动画依赖）。
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
  lines: [{ type: "add", newLine: 42, text: "changed" }],
  truncated: false,
  stats: { added, removed },
})

// 构造携带文件修改的助手消息。
const makeAssistantMessage = (blocks: ChatMessage["blocks"]): ChatMessage => ({
  id: "assistant-1",
  role: "assistant",
  model: "gpt-4o",
  blocks,
  isStreaming: false,
  timestamp: 2000,
})

describe("AgentMessageItem 文件修改统计", () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("edit 与 apply_patch 聚合为消息底部统计，apply_patch 多文件全部纳入", () => {
    const message = makeAssistantMessage([
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
      { kind: "toolCall", toolCallId: "tc-2", toolName: "apply_patch", args: {}, status: "done" },
      {
        kind: "toolResult",
        toolCallId: "tc-2",
        toolName: "apply_patch",
        text: "ok",
        isError: false,
        diffs: [makeDiff("src/b.ts", 5, 1), makeDiff("src/c.ts", 3, 0)],
      },
      { kind: "text", text: "已完成文件修改" },
    ])

    render(<AgentMessageItem message={message} />)

    expect(screen.getByTestId("file-changes-card")).not.toBeNull()
    expect(screen.getByText("3 files changed")).not.toBeNull()
    expect(document.querySelector(".agent-file-changes-total-added")?.textContent).toBe("+18")

    fireEvent.click(screen.getByText("3 files changed"))
    expect(screen.getByText("src/a.ts")).not.toBeNull()
    expect(screen.getByText("src/b.ts")).not.toBeNull()
    expect(screen.getByText("src/c.ts")).not.toBeNull()

    fireEvent.click(screen.getByText("src/a.ts"))
    expect(agentApi.openFileAt).toHaveBeenCalledWith("src/a.ts", 42)
  })

  it("无文件修改时消息底部不渲染统计卡片", () => {
    const message = makeAssistantMessage([{ kind: "text", text: "仅回答问题" }])
    render(<AgentMessageItem message={message} />)
    expect(screen.queryByTestId("file-changes-card")).toBeNull()
  })

  it("续写消息中的文件修改计入同一统计卡片", () => {
    const message = makeAssistantMessage([
      {
        kind: "toolCall",
        toolCallId: "tc-1",
        toolName: "write",
        args: { path: "src/new.ts" },
        status: "done",
      },
      {
        kind: "toolResult",
        toolCallId: "tc-1",
        toolName: "write",
        text: "ok",
        isError: false,
        diff: makeDiff("src/new.ts", 7, 0),
      },
      { kind: "text", text: "第一部分" },
    ])
    const continuation: ChatMessage = {
      id: "assistant-2",
      role: "assistant",
      model: "gpt-4o",
      blocks: [
        {
          kind: "toolCall",
          toolCallId: "tc-2",
          toolName: "edit",
          args: { filePath: "src/a.ts" },
          status: "done",
        },
        {
          kind: "toolResult",
          toolCallId: "tc-2",
          toolName: "edit",
          text: "ok",
          isError: false,
          diff: makeDiff("src/a.ts", 2, 1),
        },
      ],
      isStreaming: false,
      timestamp: 3000,
    }

    render(<AgentMessageItem message={message} continuationMessages={[continuation]} />)

    expect(screen.getByText("2 files changed")).not.toBeNull()
    expect(document.querySelector(".agent-file-changes-total-added")?.textContent).toBe("+9")
  })
})
