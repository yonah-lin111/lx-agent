// @vitest-environment jsdom

import type { OpenClawChatMessage } from "@shared/contracts/openclaw"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { type ConversationAgent, OpenClawMessageList } from "@/features/openclaw"

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

describe("OpenClawMessageList & OpenClawMessageItem", () => {
  afterEach(() => {
    cleanup()
  })

  it("无消息时展示空态提示", () => {
    render(<OpenClawMessageList agent={agent} messages={[]} />)

    expect(screen.getByText("No message yet. Pick a coworker and send a task.")).not.toBeNull()
  })

  it("渲染单员工会话并标注来源员工与头像首字母", () => {
    render(
      <OpenClawMessageList
        agent={agent}
        messages={[user("u1", "帮我看看登录逻辑", 100), assistant("a1", "lily-reply", 200)]}
      />,
    )

    expect(screen.getByText("帮我看看登录逻辑")).not.toBeNull()
    expect(screen.getByText("lily-reply")).not.toBeNull()
    expect(screen.getByText("Lily")).not.toBeNull()
    expect(screen.getByText("L")).not.toBeNull()
  })

  it("系统消息渲染审批提示", () => {
    render(
      <OpenClawMessageList
        agent={agent}
        messages={[
          {
            id: "s1",
            role: "system",
            content: "req-1",
            timestamp: 100,
            status: "completed",
            code: "approval-required",
          },
        ]}
      />,
    )

    expect(screen.getByText(/req-1/)).not.toBeNull()
  })

  it("流式中展示底部工作状态", () => {
    render(
      <OpenClawMessageList
        agent={agent}
        messages={[assistant("a1", "partial", 100)]}
        isStreaming
      />,
    )

    expect(screen.getByText("Working…")).not.toBeNull()
  })
})
