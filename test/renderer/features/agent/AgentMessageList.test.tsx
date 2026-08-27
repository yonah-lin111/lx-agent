// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AgentMessageList } from "@/features/agent/components/AgentMessageList"
import * as useMessagePinHook from "@/features/agent/hooks/useMessagePin"
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

    const editBtns = screen.getAllByRole("button", { name: "Edit Message" })
    expect(editBtns.length).toBe(2)

    // 点击第一条消息的编辑按钮
    fireEvent.click(editBtns[0])

    let textareas = screen.getAllByRole("textbox")
    expect(textareas.length).toBe(1)
    expect((textareas[0] as HTMLTextAreaElement).value).toBe("消息 1")

    // 点击第二条消息的编辑按钮
    const remainingEditBtns = screen.getAllByRole("button", { name: "Edit Message" })
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
    expect(screen.getByText("read src/main.ts")).not.toBeNull()
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

    expect(screen.getAllByRole("button", { name: "Copy message" }).length).toBe(1)
  })

  it("用户消息与其后 AI 回复合并为 QA 对，未吸顶时绝对定位容器不渲染", () => {
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

    // 未吸顶时，绝对定位的浮动容器不渲染
    const absoluteContainer = container.querySelector(".absolute.top-0.left-0.right-0.z-30")
    expect(absoluteContainer).toBeNull()

    // 用户消息和回复在自然流中正常渲染
    expect(screen.getByText("问题一")).not.toBeNull()
    expect(screen.getByText("回答一")).not.toBeNull()
  })

  it("无回复的独立用户消息自成 QA 对，正常渲染编辑操作", () => {
    const messages: ChatMessage[] = [userMessage("lone-q", "待回复问题")]

    render(<AgentMessageList messages={messages} onSelectPrompt={vi.fn()} />)

    expect(screen.getByRole("button", { name: "Edit Message" })).not.toBeNull()
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

  it("吸顶时绝对定位容器渲染，带有 animate-pinned-in 动画；关闭时过渡到 animate-pinned-out，动画结束后卸载", () => {
    const useMessagePinSpy = vi.spyOn(useMessagePinHook, "useMessagePin").mockReturnValue({
      pinnedUserMessageId: "qa-q",
      attachUserMessageEndRef: () => () => {},
      updatePinnedQuestion: () => {},
    })

    const messages: ChatMessage[] = [
      userMessage("qa-q", "问题一"),
      {
        id: "qa-a",
        role: "assistant",
        blocks: [{ kind: "text", text: "回答一" }],
        isStreaming: false,
      },
    ]

    const { container, rerender } = render(
      <AgentMessageList messages={messages} onSelectPrompt={vi.fn()} />,
    )

    // 吸顶时绝对定位容器渲染，带有 animate-pinned-in
    const absoluteContainer = container.querySelector(".absolute.top-0.left-0.right-0.z-30")
    expect(absoluteContainer).not.toBeNull()
    expect(absoluteContainer?.className).toContain("animate-pinned-in")

    // 变为不吸顶时，设置 isClosing 为 true 并挂载 animate-pinned-out
    useMessagePinSpy.mockReturnValue({
      pinnedUserMessageId: null,
      attachUserMessageEndRef: () => () => {},
      updatePinnedQuestion: () => {},
    })

    rerender(<AgentMessageList messages={messages} onSelectPrompt={vi.fn()} />)

    // 应该依然渲染，但 class 变为 animate-pinned-out
    const closingContainer = container.querySelector(".absolute.top-0.left-0.right-0.z-30")
    expect(closingContainer).not.toBeNull()
    expect(closingContainer?.className).toContain("animate-pinned-out")

    // 模拟动画结束（通过 React 内部属性直接触发 onAnimationEnd 绕过 JSDOM 动画事件局限）
    act(() => {
      const reactPropsKey = Object.keys(closingContainer!).find((key) =>
        key.startsWith("__reactProps"),
      )
      if (reactPropsKey) {
        ;(closingContainer as any)[reactPropsKey].onAnimationEnd({
          target: closingContainer,
          currentTarget: closingContainer,
        })
      }
    })

    // 之后完全不渲染
    const unmountedContainer = container.querySelector(".absolute.top-0.left-0.right-0.z-30")
    expect(unmountedContainer).toBeNull()

    useMessagePinSpy.mockRestore()
  })

  it("触发 steer 后，上一条 AI 消息底部的操作按钮仍显示", async () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", blocks: [{ kind: "text", text: "原始问题" }], isStreaming: false },
      {
        id: "a1",
        role: "assistant",
        blocks: [{ kind: "text", text: "第一轮回复" }],
        isStreaming: false,
        usage: { input: 1, output: 1, cacheRead: 0, totalTokens: 2 },
      },
      {
        id: "steer1",
        role: "user",
        isSteer: true,
        blocks: [{ kind: "text", text: "插话内容" }],
        isStreaming: false,
      },
      {
        id: "a2",
        role: "assistant",
        blocks: [{ kind: "text", text: "第二轮回复中" }],
        isStreaming: true,
      },
    ]

    render(
      <AgentMessageList
        messages={messages}
        isStreaming={true}
        onSelectPrompt={vi.fn()}
        onSendSuggestedQuestion={vi.fn()}
        onEchoToInput={vi.fn()}
      />,
    )
    await act(async () => {})

    // 第一条 AI 回复仍在且已定型，其复制操作按钮应渲染（不被 loader 遮盖）。
    expect(screen.getByText("第一轮回复")).not.toBeNull()
    expect(screen.getAllByRole("button", { name: "Copy message" }).length).toBeGreaterThan(0)
  })

  it("不渲染 modelSwitch 角色消息（模型切换与初始化模型仅在执行流中显示）", () => {
    const messages: ChatMessage[] = [
      {
        id: "switch-1",
        role: "modelSwitch",
        model: "gpt-4o",
        provider: "openai",
        isInitial: true,
        instructions: "Do good things.",
        blocks: [],
        isStreaming: false,
      },
      userMessage("u1", "用户问题"),
      {
        id: "switch-2",
        role: "modelSwitch",
        model: "claude-3-5-sonnet",
        provider: "anthropic",
        isInitial: false,
        blocks: [],
        isStreaming: false,
      },
    ]

    render(<AgentMessageList messages={messages} onSelectPrompt={vi.fn()} />)

    expect(screen.getByText("用户问题")).not.toBeNull()
    expect(screen.queryByText(/gpt-4o/i)).toBeNull()
    expect(screen.queryByText(/claude-3-5-sonnet/i)).toBeNull()
    expect(screen.queryByText(/Do good things/i)).toBeNull()
  })
})
