// @vitest-environment jsdom

import type { OpenClawChatMessage } from "@shared/contracts/openclaw"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OpenClawMessageList } from "@/features/openclaw/components/OpenClawMessageList"
import type { OfficeTimelineMessage } from "@/features/openclaw/hooks/useOpenClawOffice"

const assistant = (
  id: string,
  content: string,
  timestamp: number,
  extra: Partial<OpenClawChatMessage> = {},
): OpenClawChatMessage => ({
  id,
  role: "assistant",
  content,
  timestamp,
  status: "completed",
  ...extra,
})

const user = (id: string, content: string, timestamp: number): OpenClawChatMessage => ({
  id,
  role: "user",
  content,
  timestamp,
  status: "completed",
})

const agents = [
  { agentId: "lily", name: "Lily", accent: "#ff6b6b" },
  { agentId: "amy", name: "Amy", accent: "#6bcf7f" },
]

describe("OpenClawMessageList & OpenClawMessageItem", () => {
  afterEach(() => {
    cleanup()
  })

  it("无消息时展示空态提示", () => {
    render(<OpenClawMessageList timeline={[]} agents={agents} />)

    expect(screen.getByText("No message yet. Pick a coworker and send a task.")).not.toBeNull()
  })

  it("跨 Agent 交错渲染并标注来源员工与头像首字母", () => {
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: user("u1", "帮我看看登录逻辑", 100) },
      { agentId: "lily", message: assistant("a1", "lily-reply", 200) },
      { agentId: "amy", message: assistant("a2", "amy-reply", 300) },
    ]

    render(<OpenClawMessageList timeline={timeline} agents={agents} />)

    expect(screen.getByText("帮我看看登录逻辑")).not.toBeNull()
    expect(screen.getByText("lily-reply")).not.toBeNull()
    expect(screen.getByText("amy-reply")).not.toBeNull()
    expect(screen.getByText("Lily")).not.toBeNull()
    expect(screen.getByText("Amy")).not.toBeNull()
    expect(screen.getByText("L")).not.toBeNull()
    expect(screen.getByText("A")).not.toBeNull()
  })

  it("AI 消息气泡使用助手气泡主题钩子，与主 Agent 消息样式一致", () => {
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: user("u1", "assign", 100) },
      { agentId: "lily", message: assistant("a1", "lily-reply", 200) },
    ]

    const { container } = render(<OpenClawMessageList timeline={timeline} agents={agents} />)

    const assistantBubble = container.querySelector('[data-assistant-bubble="true"]')
    expect(assistantBubble).not.toBeNull()
    expect(assistantBubble?.className).toContain("bg-[#303030]")
    // 用户气泡使用对称钩子（青金石气泡）。
    expect(container.querySelector('[data-user-bubble="true"]')).not.toBeNull()
  })

  it("用户消息被合并时展示所 @ 的所有 agents 徽标", () => {
    const timeline: OfficeTimelineMessage[] = [
      {
        agentId: "lily",
        message: user("u1", "多Agent协同测试", 100),
        targetAgentIds: ["lily", "amy"],
      },
    ]

    render(<OpenClawMessageList timeline={timeline} agents={agents} />)

    expect(screen.getByText("多Agent协同测试")).not.toBeNull()
    expect(screen.getByText("@Lily")).not.toBeNull()
    expect(screen.getByText("@Amy")).not.toBeNull()
  })

  it("仅正在输出的消息展示 loading 指示，历史消息不受影响", () => {
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: assistant("a1", "done", 100) },
      { agentId: "lily", message: { ...assistant("a2", "", 200), status: "streaming" } },
    ]

    const { container } = render(<OpenClawMessageList timeline={timeline} agents={agents} />)

    const bubbles = container.querySelectorAll('[data-assistant-bubble="true"]')
    expect(bubbles).toHaveLength(2)
    // 历史完成消息无光标/loading；流式中空内容消息展示 3 个 loading 圆点。
    expect(bubbles[0]?.querySelectorAll(".animate-pulse")).toHaveLength(0)
    expect(bubbles[1]?.querySelectorAll(".animate-pulse")).toHaveLength(3)
    // 底部"工作中"汇总提示已移除。
    expect(screen.queryByText(/coworker/)).toBeNull()
  })

  it("消息头部展示该条消息记录的模型名，且不渲染上下文统计", () => {
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: user("u1", "assign", 100) },
      {
        agentId: "lily",
        message: assistant("a1", "reply", 200, {
          model: "gpt-5.2",
          modelProvider: "openai",
          usage: { input: 100000, output: 10 },
        }),
      },
      { agentId: "lily", message: assistant("a2", "no-model-reply", 300) },
    ]

    render(<OpenClawMessageList timeline={timeline} agents={agents} />)

    // 仅记录了模型的消息展示模型名，未记录的消息不渲染。
    expect(screen.getByText("gpt-5.2")).not.toBeNull()
    expect(screen.getByText("no-model-reply")).not.toBeNull()
    expect(screen.queryByText(/^\d+%$/)).toBeNull()
  })

  it("用户发送新消息后平滑滚动到底部", () => {
    const scrollHeightSpy = vi
      .spyOn(window.HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(1000)
    const scrollTo = vi.fn()
    const originalScrollTo = window.HTMLElement.prototype.scrollTo
    window.HTMLElement.prototype.scrollTo = scrollTo

    try {
      const timeline: OfficeTimelineMessage[] = [
        { agentId: "lily", message: assistant("a1", "回答", 100) },
      ]
      const { rerender } = render(<OpenClawMessageList timeline={timeline} agents={agents} />)
      scrollTo.mockClear()

      rerender(
        <OpenClawMessageList
          timeline={[...timeline, { agentId: "lily", message: user("u1", "新问题", 200) }]}
          agents={agents}
        />,
      )

      expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" })
    } finally {
      scrollHeightSpy.mockRestore()
      window.HTMLElement.prototype.scrollTo = originalScrollTo
    }
  })

  it("用户上滚后释放吸底并显示回到底部按钮", () => {
    const clientHeightSpy = vi
      .spyOn(window.HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(600)
    const scrollHeightSpy = vi
      .spyOn(window.HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(1000)
    let scrollTopValue = 0
    const scrollTopGetSpy = vi
      .spyOn(window.HTMLElement.prototype, "scrollTop", "get")
      .mockImplementation(() => scrollTopValue)
    const scrollTopSetSpy = vi
      .spyOn(window.HTMLElement.prototype, "scrollTop", "set")
      .mockImplementation((val) => {
        scrollTopValue = val
      })
    const scrollTo = vi.fn()
    const originalScrollTo = window.HTMLElement.prototype.scrollTo
    window.HTMLElement.prototype.scrollTo = scrollTo

    try {
      const timeline: OfficeTimelineMessage[] = [
        { agentId: "lily", message: user("u1", "问题", 100) },
        { agentId: "lily", message: assistant("a1", "回答", 200) },
      ]
      const { container, rerender } = render(
        <OpenClawMessageList timeline={timeline} agents={agents} />,
      )
      const scrollEl = container.querySelector(".custom-scrollbar") as HTMLDivElement
      expect(scrollEl).not.toBeNull()

      // 初始在底部：锁定吸底。
      fireEvent.scroll(scrollEl)

      // 用户主动上滚（1000 → 100）：释放吸底、显示回到底部按钮。
      scrollTopValue = 100
      fireEvent.scroll(scrollEl)
      expect(screen.getByRole("button", { name: "Scroll to bottom" })).not.toBeNull()

      // 流式增量不再强制吸底，保持用户的浏览位置。
      rerender(
        <OpenClawMessageList
          timeline={[
            ...timeline,
            { agentId: "lily", message: { ...assistant("a2", "增量", 300), status: "streaming" } },
          ]}
          agents={agents}
        />,
      )
      expect(scrollEl.scrollTop).toBe(100)

      // 点击回到底部：恢复吸底并触发平滑滚动。
      fireEvent.click(screen.getByRole("button", { name: "Scroll to bottom" }))
      expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" })
      expect(screen.queryByRole("button", { name: "Scroll to bottom" })).toBeNull()
    } finally {
      clientHeightSpy.mockRestore()
      scrollHeightSpy.mockRestore()
      scrollTopGetSpy.mockRestore()
      scrollTopSetSpy.mockRestore()
      window.HTMLElement.prototype.scrollTo = originalScrollTo
    }
  })

  it("吸底状态下流式增量仍跟随到底部", () => {
    const clientHeightSpy = vi
      .spyOn(window.HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(600)
    const scrollHeightSpy = vi
      .spyOn(window.HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(1000)
    let scrollTopValue = 0
    const scrollTopSetSpy = vi
      .spyOn(window.HTMLElement.prototype, "scrollTop", "set")
      .mockImplementation((val) => {
        scrollTopValue = val
      })

    try {
      const timeline: OfficeTimelineMessage[] = [
        { agentId: "lily", message: user("u1", "问题", 100) },
        { agentId: "lily", message: assistant("a1", "回答", 200) },
      ]
      const { rerender } = render(<OpenClawMessageList timeline={timeline} agents={agents} />)

      rerender(
        <OpenClawMessageList
          timeline={[
            ...timeline,
            { agentId: "lily", message: { ...assistant("a2", "更多", 300), status: "streaming" } },
          ]}
          agents={agents}
        />,
      )

      expect(scrollTopValue).toBe(1000)
    } finally {
      clientHeightSpy.mockRestore()
      scrollHeightSpy.mockRestore()
      scrollTopSetSpy.mockRestore()
    }
  })
})
