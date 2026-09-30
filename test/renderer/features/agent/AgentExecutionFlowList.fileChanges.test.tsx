// @vitest-environment jsdom

import type { AgentDiff } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowList } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowList"
import { agentFileRevertStore } from "@/features/agent/hooks/agentFileRevertStore"
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
    agentFileRevertStore.clearSession("session-1")
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

  it("源轮存在回退标记时在卡片后渲染已回退 item（可展开文件清单）", () => {
    agentFileRevertStore.setSessionMarks("session-1", [
      { userMessageTimestamp: 1000, file: "src/a.ts", revertedAt: 456 },
    ])

    render(
      <AgentExecutionFlowList
        messages={[makeUserMessage(), makeEditAssistantMessage("assistant-1")]}
        isStreaming={false}
        sessionId="session-1"
      />,
    )

    const item = screen.getByTestId("flow-file-revert-item")
    expect(item).not.toBeNull()
    // 文件清单默认折叠，展开后显示路径与回退时间。
    expect(document.querySelector(".agent-flow-file-revert-list")).toBeNull()
    fireEvent.click(document.querySelector<HTMLButtonElement>(".agent-flow-file-revert-header")!)
    expect(document.querySelector(".agent-flow-file-revert-list")).not.toBeNull()
    expect(document.querySelector(".agent-flow-file-revert-path")?.textContent).toBe("src/a.ts")

    // item 位于文件统计卡片之后（同一轮末尾）。
    const wrapper = document.querySelector(".agent-execution-flow-file-changes")
    expect(wrapper).not.toBeNull()
    expect(
      (wrapper as Node).compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it("无回退标记时不渲染已回退 item", () => {
    render(
      <AgentExecutionFlowList
        messages={[makeUserMessage(), makeEditAssistantMessage("assistant-1")]}
        isStreaming={false}
        sessionId="session-1"
      />,
    )
    expect(screen.queryByTestId("flow-file-revert-item")).toBeNull()
  })

  it("删除按钮弹出三选一菜单：回退文件并撤销对话 / 仅撤销对话 / 仅回退文件", () => {
    const onUndoOption = vi.fn()
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
        sessionId="session-1"
        onUndoOption={onUndoOption}
      />,
    )

    // 点击删除按钮：菜单含两行（N=1 个文件改动）。
    fireEvent.click(screen.getByRole("button", { name: "Delete turn" }))
    const revertRow = document.querySelector<HTMLElement>(".agent-turn-delete-revert")
    const keepRow = document.querySelector<HTMLElement>(".agent-turn-delete-keep")
    expect(revertRow).not.toBeNull()
    expect(keepRow).not.toBeNull()

    fireEvent.click(revertRow!)
    expect(onUndoOption).toHaveBeenCalledWith("revert_and_delete")

    // 重新展开菜单：选择"仅删除本轮"传 revertFiles=false。
    fireEvent.click(screen.getByRole("button", { name: "Delete turn" }))
    fireEvent.click(document.querySelector<HTMLElement>(".agent-turn-delete-keep")!)
    expect(onUndoOption).toHaveBeenLastCalledWith("delete_only")
  })

  it("删除按钮菜单：该轮无文件改动时仍展示全部三选一选项", () => {
    const onUndoOption = vi.fn()
    const plainAssistant: ChatMessage = {
      id: "assistant-plain",
      role: "assistant",
      model: "gpt-4o",
      blocks: [{ kind: "text", text: "没有改动" }],
      isStreaming: false,
      timestamp: 2000,
    }
    render(
      <AgentExecutionFlowList
        messages={[makeUserMessage(), plainAssistant]}
        isStreaming={false}
        sessionId="session-1"
        onUndoOption={onUndoOption}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Delete turn" }))
    expect(document.querySelector(".agent-turn-delete-revert")).not.toBeNull()
    expect(document.querySelector(".agent-turn-delete-revert-only")).not.toBeNull()
    expect(document.querySelectorAll(".agent-turn-delete-menu .lx-nav-item").length).toBe(3)
    fireEvent.click(document.querySelector<HTMLElement>(".agent-turn-delete-keep")!)
    expect(onUndoOption).toHaveBeenCalledWith("delete_only")
  })
})
