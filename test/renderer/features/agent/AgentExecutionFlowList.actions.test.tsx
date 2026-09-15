// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowList } from "@/features/agent/components/AgentExecutionFlowList"
import type { ChatMessage } from "@/features/agent/types"

const turnMessages = (): ChatMessage[] => [
  {
    id: "u1",
    role: "user",
    blocks: [{ kind: "text", text: "测试轮次统计" }],
    isStreaming: false,
  },
  {
    id: "a1",
    role: "assistant",
    model: "claude-3-5-sonnet",
    durationMs: 800,
    blocks: [
      {
        kind: "toolCall",
        toolCallId: "c1",
        toolName: "bash",
        args: { command: "echo 1" },
        status: "done",
      },
      { kind: "text", text: "执行完毕" },
    ],
    usage: { input: 1200, output: 300, cacheRead: 400, cacheWrite: 0, totalTokens: 1500 },
    isStreaming: false,
  },
  {
    id: "t1",
    role: "toolResult",
    blocks: [
      {
        kind: "toolResult",
        toolCallId: "c1",
        toolName: "bash",
        text: "1",
        isError: false,
        durationMs: 250,
      },
    ],
    isStreaming: false,
  },
]

const subagentMessages = (): ChatMessage[] => [
  {
    id: "u1",
    role: "user",
    blocks: [{ kind: "text", text: "执行子任务" }],
    isStreaming: false,
  },
  {
    id: "a1",
    role: "assistant",
    blocks: [
      {
        kind: "toolCall",
        toolCallId: "task-call-1",
        toolName: "task",
        args: { description: "子任务执行", prompt: "检索并分析数据" },
        status: "done",
        subagent: {
          subagentId: "sub-123",
          name: "task_explorer",
          description: "子任务执行",
          prompt: "检索并分析数据",
          usage: { input: 120, output: 45, cacheRead: 0, cacheWrite: 0, totalTokens: 165 },
          messages: [
            {
              role: "assistant",
              provider: "anthropic",
              model: "claude-3-5-sonnet",
              usage: { input: 120, output: 45, cacheRead: 0, cacheWrite: 0, totalTokens: 165 },
              stopReason: "stop",
              timestamp: 1000,
              content: [{ type: "text", text: "子代理内部执行完成" }],
            },
          ],
          steps: [
            {
              toolName: "read",
              args: { path: "src/index.ts" },
              result: "file content",
              status: "done",
            },
          ],
        },
      },
    ],
    isStreaming: false,
  },
  {
    id: "t1",
    role: "toolResult",
    blocks: [
      {
        kind: "toolResult",
        toolCallId: "task-call-1",
        toolName: "task",
        text: "子任务执行完毕",
        isError: false,
      },
    ],
    isStreaming: false,
  },
]

describe("AgentExecutionFlowList 交互动作", () => {
  afterEach(() => {
    cleanup()
  })

  it("离开底部时展示回到底部按钮并上报导航状态，点击后平滑滚动到底部", () => {
    const onNavigationStateChange = vi.fn()
    const { container } = render(
      <AgentExecutionFlowList
        messages={turnMessages()}
        onNavigationStateChange={onNavigationStateChange}
      />,
    )
    const scrollContainer = container.querySelector(".custom-scrollbar") as HTMLDivElement
    expect(scrollContainer).not.toBeNull()

    Object.defineProperty(scrollContainer, "scrollHeight", { value: 1000, configurable: true })
    Object.defineProperty(scrollContainer, "clientHeight", { value: 300, configurable: true })
    Object.defineProperty(scrollContainer, "scrollTop", {
      value: 700,
      writable: true,
      configurable: true,
    })
    const scrollToSpy = vi.fn()
    scrollContainer.scrollTo = scrollToSpy

    // 初始处于底部：不展示回到底部按钮
    expect(screen.queryByLabelText("Scroll to bottom")).toBeNull()

    // 向上滚动离开底部：按钮出现并上报 canScrollBottom
    scrollContainer.scrollTop = 200
    fireEvent.scroll(scrollContainer)

    expect(screen.getByLabelText("Scroll to bottom")).not.toBeNull()
    expect(onNavigationStateChange).toHaveBeenCalledWith({ canScrollBottom: true })

    fireEvent.click(screen.getByLabelText("Scroll to bottom"))

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" })
  })

  it("turn 汇总行的删除按钮经二次确认后回传 onDeleteMessage", () => {
    const onDeleteMessage = vi.fn()
    render(<AgentExecutionFlowList messages={turnMessages()} onDeleteMessage={onDeleteMessage} />)

    const summary = screen.getByTestId("turn-summary-1")
    fireEvent.click(within(summary).getByLabelText("Delete turn"))

    // 二次确认由 LxTooltip 确认气泡承载
    fireEvent.click(screen.getByLabelText("Confirm"))

    expect(onDeleteMessage).toHaveBeenCalledWith("a1")
  })

  it("subagent Detail 打开面板并可关闭", () => {
    const { container } = render(<AgentExecutionFlowList messages={subagentMessages()} />)

    const dialog = (): HTMLElement | null => container.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog()?.hasAttribute("inert")).toBe(true)

    const subagentStep = container.querySelector('[data-step-kind="subagent"]') as HTMLElement
    fireEvent.click(within(subagentStep).getByText("Detail"))

    expect(dialog()?.hasAttribute("inert")).toBe(false)

    const closeButtons = within(dialog() as HTMLElement).getAllByLabelText("Close Subagent Panel")
    fireEvent.click(closeButtons[0])

    expect(dialog()?.hasAttribute("inert")).toBe(true)
  })
})
