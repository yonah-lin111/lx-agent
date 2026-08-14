// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AgentMessageList } from "@/features/agent/components/AgentMessageList"
import type { ChatMessage } from "@/features/agent/types"

// jsdom 未实现 ResizeObserver（用户消息折叠重测依赖它），用空实现代替。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

// 构造用户消息展示条目。
const userMessage = (id: string, text: string): ChatMessage => ({
  id,
  role: "user",
  blocks: [{ kind: "text", text }],
  isStreaming: false,
})

describe("AgentMessageList", () => {
  beforeEach(() => {
    cleanup()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it("消息列表中同一时间只能出现一个编辑输入框", () => {
    const messages: ChatMessage[] = [userMessage("msg-1", "消息 1"), userMessage("msg-2", "消息 2")]

    render(<AgentMessageList messages={messages} onSelectPrompt={vi.fn()} />)

    const editBtns = screen.getAllByRole("button", { name: "编辑消息" })
    expect(editBtns.length).toBe(2)

    // 点击第一条消息的编辑按钮
    fireEvent.click(editBtns[0])

    let textareas = screen.getAllByRole("textbox")
    expect(textareas.length).toBe(1)
    expect((textareas[0] as HTMLTextAreaElement).value).toBe("消息 1")

    // 点击第二条消息的编辑按钮
    const remainingEditBtns = screen.getAllByRole("button", { name: "编辑消息" })
    fireEvent.click(remainingEditBtns[0])

    textareas = screen.getAllByRole("textbox")
    // 确保页面上依然只有一个编辑输入框（针对消息 2）
    expect(textareas.length).toBe(1)
    expect((textareas[0] as HTMLTextAreaElement).value).toBe("消息 2")
  })

  it("将独立工具结果展示在对应的 AI 工具调用下", () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "tool-1",
            toolName: "read",
            args: { path: "src/main.ts" },
            status: "done",
          },
        ],
        isStreaming: false,
      },
      {
        id: "result-1",
        role: "toolResult",
        blocks: [
          {
            kind: "toolResult",
            toolCallId: "tool-1",
            toolName: "read",
            text: "const answer = 42",
            isError: false,
          },
        ],
        isStreaming: false,
      },
    ]

    render(<AgentMessageList messages={messages} onSelectPrompt={vi.fn()} />)

    expect(screen.getAllByText("Read")).toHaveLength(1)
    expect(screen.getByText("src/main.ts")).not.toBeNull()
  })

  it("同一轮 AI 执行只渲染一个底部复制操作", () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        blocks: [{ kind: "thinking", text: "先读取文件" }],
        isStreaming: false,
      },
      {
        id: "assistant-2",
        role: "assistant",
        blocks: [{ kind: "text", text: "读取完成" }],
        isStreaming: false,
      },
    ]

    render(<AgentMessageList messages={messages} onSelectPrompt={vi.fn()} />)

    expect(screen.getAllByRole("button", { name: "复制消息" }).length).toBe(1)
  })

  it("用户消息与其后 AI 回复合并为 QA 对，问题置于吸顶容器", () => {
    const messages: ChatMessage[] = [
      userMessage("qa-q", "问题一"),
      {
        id: "qa-a",
        role: "assistant",
        blocks: [{ kind: "text", text: "回答一" }],
        isStreaming: false,
      },
    ]

    const { container } = render(<AgentMessageList messages={messages} onSelectPrompt={vi.fn()} />)

    // 吸顶容器（条件渲染 .sticky）始终存在，未吸顶时无 .sticky class。
    const stickyContainer = container.querySelector(".top-0.z-20")
    expect(stickyContainer).not.toBeNull()
    expect(stickyContainer?.textContent).toContain("问题一")
    expect(container.querySelector(".sticky")).toBeNull()
    // 回复不进入吸顶容器，仍在 QA 对内正常渲染。
    expect(screen.getByText("回答一")).not.toBeNull()
  })

  it("无回复的独立用户消息自成 QA 对，正常渲染编辑操作", () => {
    const messages: ChatMessage[] = [userMessage("lone-q", "待回复问题")]

    render(<AgentMessageList messages={messages} onSelectPrompt={vi.fn()} />)

    expect(screen.getByRole("button", { name: "编辑消息" })).not.toBeNull()
    expect(screen.getByText("待回复问题")).not.toBeNull()
  })

  it("队列 drain 自动发送的 user 消息（isQueuedDrain）不触发平滑滚动到底，用户主动发送仍触发", () => {
    const scrollTo = vi.fn()
    window.HTMLElement.prototype.scrollTo = scrollTo
    const messages = [userMessage("q1", "第一问")]

    const { rerender } = render(<AgentMessageList messages={messages} onSelectPrompt={vi.fn()} />)
    scrollTo.mockClear()

    // 追加一条队列 drain 自动发送的 user 消息：不滚动。
    rerender(
      <AgentMessageList
        messages={[...messages, { ...userMessage("q2", "排队问题"), isQueuedDrain: true }]}
        onSelectPrompt={vi.fn()}
      />,
    )
    expect(scrollTo).not.toHaveBeenCalled()

    // 追加一条用户主动发送的 user 消息：平滑滚动到底。
    rerender(
      <AgentMessageList
        messages={[
          ...messages,
          { ...userMessage("q2", "排队问题"), isQueuedDrain: true },
          userMessage("q3", "主动发送"),
        ]}
        onSelectPrompt={vi.fn()}
      />,
    )
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it("手动压缩摘要渲染为默认折叠的可展开摘要块", () => {
    const messages: ChatMessage[] = [
      userMessage("msg-1", "问题"),
      {
        id: "summary-1",
        role: "compactionSummary",
        blocks: [{ kind: "text", text: "对话摘要内容" }],
        isStreaming: false,
        isManual: true,
      },
    ]
    render(<AgentMessageList messages={messages} onSelectPrompt={vi.fn()} />)

    const summary = screen.getByRole("button", {
      name: "Conversation manually compressed into summary",
    })
    expect(summary.getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(summary)
    expect(summary.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("对话摘要内容")).toBeTruthy()
  })
})
