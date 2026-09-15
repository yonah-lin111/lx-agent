// @vitest-environment jsdom

import type { OpenClawChatMessage } from "@shared/contracts/openclaw"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OpenClawMessageList } from "@/features/openclaw/components/OpenClawMessageList"
import type { OfficeTimelineMessage } from "@/features/openclaw/hooks/useOpenClawOffice"

const assistant = (id: string, content: string, timestamp: number): OpenClawChatMessage => ({
  id,
  role: "assistant",
  content,
  timestamp,
  status: "completed",
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
    render(<OpenClawMessageList timeline={[]} agents={agents} streamingAgentIds={[]} />)

    expect(screen.getByText("No message yet. Pick a coworker and send a task.")).not.toBeNull()
  })

  it("跨 Agent 交错渲染并标注来源员工与头像首字母", () => {
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: user("u1", "帮我看看登录逻辑", 100) },
      { agentId: "lily", message: assistant("a1", "lily-reply", 200) },
      { agentId: "amy", message: assistant("a2", "amy-reply", 300) },
    ]

    render(<OpenClawMessageList timeline={timeline} agents={agents} streamingAgentIds={[]} />)

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

    const { container } = render(
      <OpenClawMessageList timeline={timeline} agents={agents} streamingAgentIds={[]} />,
    )

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

    render(<OpenClawMessageList timeline={timeline} agents={agents} streamingAgentIds={[]} />)

    expect(screen.getByText("多Agent协同测试")).not.toBeNull()
    expect(screen.getByText("@Lily")).not.toBeNull()
    expect(screen.getByText("@Amy")).not.toBeNull()
  })

  it("存在员工流式时展示消息内 loading 和底部工作中状态", () => {
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: assistant("a1", "", 100) },
    ]

    render(<OpenClawMessageList timeline={timeline} agents={agents} streamingAgentIds={["lily"]} />)

    expect(screen.getByText("1 coworker(s) working…")).not.toBeNull()
  })

  it("仅最新一条 AI 消息展示模型与上下文百分比", () => {
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: user("u1", "assign", 100) },
      { agentId: "lily", message: assistant("a1", "first", 200) },
      { agentId: "lily", message: assistant("a2", "second", 300) },
      { agentId: "amy", message: assistant("a3", "amy-reply", 400) },
    ]

    render(
      <OpenClawMessageList
        timeline={timeline}
        agents={agents}
        streamingAgentIds={[]}
        sessionStats={{
          lily: {
            model: "gemini-3.8-flash",
            modelProvider: "google",
            contextUsed: 250000,
            contextWindow: 1000000,
          },
        }}
      />,
    )

    // getByText 在多处命中时会抛错：能取到即证明只有最新一条 AI 消息展示。
    expect(screen.getByText("gemini-3.8-flash")).not.toBeNull()
    expect(screen.getByText("25%")).not.toBeNull()
    expect(screen.getAllByText("Lily")).toHaveLength(2)
  })

  it("无会话统计时不在名称右侧渲染模型与上下文", () => {
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: user("u1", "assign", 100) },
      { agentId: "lily", message: assistant("a1", "reply", 200) },
    ]

    render(<OpenClawMessageList timeline={timeline} agents={agents} streamingAgentIds={[]} />)

    expect(screen.queryByText("gemini-3.8-flash")).toBeNull()
    expect(screen.queryByText(/^\d+%$/)).toBeNull()
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
        <OpenClawMessageList timeline={timeline} agents={agents} streamingAgentIds={[]} />,
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
          timeline={[...timeline, { agentId: "lily", message: assistant("a2", "增量", 300) }]}
          agents={agents}
          streamingAgentIds={["lily"]}
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
      const { rerender } = render(
        <OpenClawMessageList timeline={timeline} agents={agents} streamingAgentIds={["lily"]} />,
      )

      rerender(
        <OpenClawMessageList
          timeline={[...timeline, { agentId: "lily", message: assistant("a2", "更多", 300) }]}
          agents={agents}
          streamingAgentIds={["lily"]}
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
