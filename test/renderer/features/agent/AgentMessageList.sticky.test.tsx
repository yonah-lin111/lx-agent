// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AgentMessageList } from "@/features/agent/components/AgentMessageList"
import type { ChatMessage } from "@/features/agent/types"

// 记录 AgentMessageItem 收到的 props，供断言 isPinned（mock 组件避免干扰其他断言）。
const { mockMessageItemProps } = vi.hoisted(() => ({
  mockMessageItemProps: [] as Array<Record<string, unknown>>,
}))
vi.mock("@/features/agent/components/AgentMessageItem", () => ({
  AgentMessageItem: (props: Record<string, unknown>) => {
    mockMessageItemProps.push(props)
    return null
  },
}))

const userMessage = (id: string, text: string): ChatMessage => ({
  id,
  role: "user",
  blocks: [{ kind: "text", text }],
  isStreaming: false,
})
const assistantMessage = (id: string, text: string): ChatMessage => ({
  id,
  role: "assistant",
  blocks: [{ kind: "text", text }],
  isStreaming: false,
})

const rect = (top: number, bottom: number): DOMRect =>
  ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top }) as DOMRect

const renderList = () => {
  const messages: ChatMessage[] = [
    userMessage("q1", "问题一"),
    assistantMessage("a1", "回答一"),
    userMessage("q2", "问题二"),
    assistantMessage("a2", "回答二"),
  ]
  const { container } = render(<AgentMessageList messages={messages} onSelectPrompt={vi.fn()} />)
  const scrollEl = container.querySelector(".custom-scrollbar") as HTMLDivElement
  Object.defineProperty(scrollEl, "clientHeight", { value: 600, configurable: true })
  // 吸顶判定锚点：用户消息自然流结束位置（useMessagePin 据此判定是否完全滚出视口）。
  const anchorEls = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
  // 吸顶容器仅在钉住时挂 .sticky class。
  const stickyContainerEls = Array.from(container.querySelectorAll(".top-0.z-20"))
  return { scrollEl, anchorEls, stickyContainerEls }
}

// 读取最近一次渲染时某条消息收到的 isPinned 状态。
const pinState = (id: string): boolean | undefined =>
  mockMessageItemProps.filter((p) => (p.message as ChatMessage | undefined)?.id === id).at(-1)
    ?.isPinned as boolean | undefined

describe("AgentMessageList 吸顶判定", () => {
  beforeEach(() => {
    cleanup()
    mockMessageItemProps.length = 0
  })

  it("滚动回顶部（scrollTop=0）时，首条自然贴顶的消息不被判为吸顶", () => {
    const { scrollEl, anchorEls } = renderList()

    Object.defineProperty(scrollEl, "scrollTop", { value: 0, configurable: true })
    vi.spyOn(scrollEl, "getBoundingClientRect").mockReturnValue(rect(0, 600))
    // 首条消息自然位置就在容器顶部（锚点亦贴顶）。
    vi.spyOn(anchorEls[0]!, "getBoundingClientRect").mockReturnValue(rect(4, 34))
    vi.spyOn(anchorEls[1]!, "getBoundingClientRect").mockReturnValue(rect(300, 330))

    fireEvent.scroll(scrollEl)

    expect(pinState("q1")).toBe(false)
    expect(pinState("q2")).toBe(false)
  })

  it("滚动中贴住容器顶部的消息被钉住居中，滚出视口的消息不再钉住", () => {
    const { scrollEl, anchorEls } = renderList()

    Object.defineProperty(scrollEl, "scrollTop", { value: 400, configurable: true })
    vi.spyOn(scrollEl, "getBoundingClientRect").mockReturnValue(rect(0, 600))
    // q1 已滚出视口顶部，q2 锚点贴住容器顶部。
    vi.spyOn(anchorEls[0]!, "getBoundingClientRect").mockReturnValue(rect(-60, -30))
    vi.spyOn(anchorEls[1]!, "getBoundingClientRect").mockReturnValue(rect(0, 30))

    fireEvent.scroll(scrollEl)

    expect(pinState("q1")).toBe(false)
    expect(pinState("q2")).toBe(true)
  })

  it("吸顶期间持续滚动保持钉住，直至消息滚回视口内解除", () => {
    const { scrollEl, anchorEls } = renderList()

    // 第一阶段：q2 吸顶。
    Object.defineProperty(scrollEl, "scrollTop", { value: 400, configurable: true })
    vi.spyOn(scrollEl, "getBoundingClientRect").mockReturnValue(rect(0, 600))
    vi.spyOn(anchorEls[0]!, "getBoundingClientRect").mockReturnValue(rect(-60, -30))
    vi.spyOn(anchorEls[1]!, "getBoundingClientRect").mockReturnValue(rect(0, 30))
    fireEvent.scroll(scrollEl)
    expect(pinState("q2")).toBe(true)
    mockMessageItemProps.length = 0

    // 第二阶段：继续滚动，q2 仍在视口上方（锚点保持越过容器顶部），应保持钉住。
    // 钉住状态不变时 React 对相同 state bail out、不触发 re-render，
    // 因此没有新的 props 记录 —— 这即"状态未翻转"的证据。
    Object.defineProperty(scrollEl, "scrollTop", { value: 600, configurable: true })
    vi.spyOn(anchorEls[0]!, "getBoundingClientRect").mockReturnValue(rect(-260, -230))
    vi.spyOn(anchorEls[1]!, "getBoundingClientRect").mockReturnValue(rect(-200, -170))
    fireEvent.scroll(scrollEl)
    expect(mockMessageItemProps).toHaveLength(0)

    // 第三阶段：回滚使 q2 锚点回到容器顶部以下（消息重新可见），应解除钉住。
    mockMessageItemProps.length = 0
    Object.defineProperty(scrollEl, "scrollTop", { value: 100, configurable: true })
    vi.spyOn(anchorEls[0]!, "getBoundingClientRect").mockReturnValue(rect(160, 190))
    vi.spyOn(anchorEls[1]!, "getBoundingClientRect").mockReturnValue(rect(220, 250))
    fireEvent.scroll(scrollEl)
    expect(pinState("q2")).toBe(false)
  })

  it("在底部附近向上滚动时，释放吸底锁，即使触发 visibleGroups 更新也不应自动滚到底部", () => {
    // 1. Mock HTMLElement prototype to simulate a rendered state with dimensions
    const clientHeightSpy = vi
      .spyOn(window.HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(600)
    const scrollHeightSpy = vi
      .spyOn(window.HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(1000)
    let scrollTopValue = 400
    const scrollTopGetSpy = vi
      .spyOn(window.HTMLElement.prototype, "scrollTop", "get")
      .mockImplementation(() => scrollTopValue)
    const scrollTopSetSpy = vi
      .spyOn(window.HTMLElement.prototype, "scrollTop", "set")
      .mockImplementation((val) => {
        scrollTopValue = val
      })

    const originalScrollTo = window.HTMLElement.prototype.scrollTo
    window.HTMLElement.prototype.scrollTo = vi.fn()

    try {
      const messages: ChatMessage[] = [
        userMessage("q1", "问题一"),
        assistantMessage("a1", "回答一"),
      ]
      const { container, rerender } = render(
        <AgentMessageList messages={messages} onSelectPrompt={vi.fn()} />,
      )
      const scrollEl = container.querySelector(".custom-scrollbar") as HTMLDivElement

      // 触发初始滚动（此时在最底部，锁定在底部）
      fireEvent.scroll(scrollEl)

      // 2. 稍微向上滚动 (scrollTop = 390)，仍在 250px 阈值内
      scrollTopValue = 390
      fireEvent.scroll(scrollEl)

      // 3. 追加一条新消息，这会改变 visibleGroups，从而触发 layoutEffect
      const nextMessages = [...messages, userMessage("q2", "问题二")]
      rerender(<AgentMessageList messages={nextMessages} onSelectPrompt={vi.fn()} />)

      // 如果吸底锁没有释放，scrollTop 会被强制设置为 scrollHeight (1000)
      // 如果正确释放了，它应该保持在原来的位置 (390)
      expect(scrollEl.scrollTop).not.toBe(1000)
      expect(scrollEl.scrollTop).toBe(390)
    } finally {
      // Restore prototype mocks
      clientHeightSpy.mockRestore()
      scrollHeightSpy.mockRestore()
      scrollTopGetSpy.mockRestore()
      scrollTopSetSpy.mockRestore()
      window.HTMLElement.prototype.scrollTo = originalScrollTo
    }
  })
})
