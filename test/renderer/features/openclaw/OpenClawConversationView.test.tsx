// @vitest-environment jsdom

import type { OpenClawChatMessage } from "@shared/contracts/openclaw"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { OpenClawConversationView } from "@/features/openclaw/components/OpenClawConversationView"
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

describe("OpenClawConversationView", () => {
  afterEach(() => {
    cleanup()
  })

  it("无消息时展示空态提示", () => {
    render(<OpenClawConversationView timeline={[]} agents={agents} />)

    expect(screen.getByText("No message yet. Pick a coworker and send a task.")).not.toBeNull()
  })

  it("跨 Agent 交错渲染并标注来源员工", () => {
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: user("u1", "帮我看看登录逻辑", 100) },
      { agentId: "lily", message: assistant("a1", "lily-reply", 200) },
      { agentId: "amy", message: assistant("a2", "amy-reply", 300) },
    ]

    render(<OpenClawConversationView timeline={timeline} agents={agents} />)

    // 用户消息与两条助手回复均在单一时间线上
    expect(screen.getByText("帮我看看登录逻辑")).not.toBeNull()
    expect(screen.getByText("lily-reply")).not.toBeNull()
    expect(screen.getByText("amy-reply")).not.toBeNull()
    // 每条助手消息标注来源员工名
    expect(screen.getByText("Lily")).not.toBeNull()
    expect(screen.getByText("Amy")).not.toBeNull()
  })

  it("仅正在输出的消息展示 loading，历史消息不展示", () => {
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: assistant("a1", "done", 100) },
      { agentId: "lily", message: { ...assistant("a2", "", 200), status: "streaming" } },
    ]

    const { container } = render(<OpenClawConversationView timeline={timeline} agents={agents} />)

    const bubbles = container.querySelectorAll('[data-assistant-bubble="true"]')
    expect(bubbles).toHaveLength(2)
    expect(bubbles[0]?.querySelectorAll(".animate-pulse")).toHaveLength(0)
    expect(bubbles[1]?.querySelectorAll(".animate-pulse")).toHaveLength(3)
  })
})
