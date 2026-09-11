// @vitest-environment jsdom

import type { OpenClawChatMessage } from "@shared/contracts/openclaw"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { type ConversationAgent, OpenClawConversationView } from "@/features/openclaw"

const agent: ConversationAgent = { agentId: "lily", name: "Lily", accent: "#ff6b6b" }

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

describe("OpenClawConversationView", () => {
  afterEach(() => {
    cleanup()
  })

  it("无消息时展示空态提示", () => {
    render(<OpenClawConversationView agent={agent} messages={[]} />)

    expect(screen.getByText("No message yet. Pick a coworker and send a task.")).not.toBeNull()
  })

  it("渲染当前员工的单条会话并标注来源员工", () => {
    render(
      <OpenClawConversationView
        agent={agent}
        messages={[user("u1", "帮我看看登录逻辑", 100), assistant("a1", "lily-reply", 200)]}
      />,
    )

    expect(screen.getByText("帮我看看登录逻辑")).not.toBeNull()
    expect(screen.getByText("lily-reply")).not.toBeNull()
    expect(screen.getByText("Lily")).not.toBeNull()
  })

  it("该员工流式时展示工作中提示", () => {
    render(
      <OpenClawConversationView
        agent={agent}
        messages={[assistant("a1", "partial", 100)]}
        isStreaming
      />,
    )

    expect(screen.getByText("Working…")).not.toBeNull()
  })
})
