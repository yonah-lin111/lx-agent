// @vitest-environment jsdom

import type { OpenClawChatMessage } from "@shared/contracts/openclaw"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
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
})
