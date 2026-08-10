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
  const stickyEls = container.querySelectorAll(".sticky")
  return { scrollEl, stickyEls }
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
    const { scrollEl, stickyEls } = renderList()

    Object.defineProperty(scrollEl, "scrollTop", { value: 0, configurable: true })
    vi.spyOn(scrollEl, "getBoundingClientRect").mockReturnValue(rect(0, 600))
    // 首条消息自然位置就在容器顶部（内边距 4px 处）。
    vi.spyOn(stickyEls[0], "getBoundingClientRect").mockReturnValue(rect(4, 34))
    vi.spyOn(stickyEls[1], "getBoundingClientRect").mockReturnValue(rect(300, 330))

    fireEvent.scroll(scrollEl)

    expect(pinState("q1")).toBe(false)
    expect(pinState("q2")).toBe(false)
  })

  it("滚动中贴住容器顶部的消息被钉住居中，滚出视口的消息不再钉住", () => {
    const { scrollEl, stickyEls } = renderList()

    Object.defineProperty(scrollEl, "scrollTop", { value: 400, configurable: true })
    vi.spyOn(scrollEl, "getBoundingClientRect").mockReturnValue(rect(0, 600))
    // q1 已滚出视口顶部，q2 吸顶贴住容器顶部。
    vi.spyOn(stickyEls[0], "getBoundingClientRect").mockReturnValue(rect(-60, -30))
    vi.spyOn(stickyEls[1], "getBoundingClientRect").mockReturnValue(rect(0, 30))

    fireEvent.scroll(scrollEl)

    expect(pinState("q1")).toBe(false)
    expect(pinState("q2")).toBe(true)
  })

  it("吸顶期间已钉住的消息保持居中（滞回），直至其滚出视口", () => {
    const { scrollEl, stickyEls } = renderList()

    // 第一阶段：q2 吸顶。
    Object.defineProperty(scrollEl, "scrollTop", { value: 400, configurable: true })
    vi.spyOn(scrollEl, "getBoundingClientRect").mockReturnValue(rect(0, 600))
    vi.spyOn(stickyEls[0], "getBoundingClientRect").mockReturnValue(rect(-60, -30))
    vi.spyOn(stickyEls[1], "getBoundingClientRect").mockReturnValue(rect(0, 30))
    fireEvent.scroll(scrollEl)
    mockMessageItemProps.length = 0

    // 第二阶段：继续滚动，q2 仍贴顶（rect 略微抖动仍在容差内），应保持钉住。
    // 滞回生效时 pinnedUserMessageId 不变，React 对相同 state bail out、不触发 re-render，
    // 因此没有新的 props 记录 —— 这即"状态未翻转"的证据。
    vi.spyOn(stickyEls[1], "getBoundingClientRect").mockReturnValue(rect(2, 32))
    fireEvent.scroll(scrollEl)
    expect(mockMessageItemProps).toHaveLength(0)

    // 第三阶段：q2 滚出视口，应解除钉住。
    mockMessageItemProps.length = 0
    vi.spyOn(stickyEls[1], "getBoundingClientRect").mockReturnValue(rect(-40, -10))
    fireEvent.scroll(scrollEl)
    expect(pinState("q2")).toBe(false)
  })
})
