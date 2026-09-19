// @vitest-environment jsdom

import type { AgentMessage, InterAgentCommunication, SubagentData } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentSubagentPanel } from "@/features/agent/components/panels/AgentSubagentPanel"
import type { ChatBlock } from "@/features/agent/types"

// 子代理调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 子代理助手消息。
const assistantMessage = (text: string, timestamp: number): AgentMessage => ({
  role: "assistant",
  content: [{ type: "text", text }],
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15 },
  stopReason: "stop",
  timestamp,
})

// 两轮协议信元：派发（triggerTurn）+ 结果。
const buildCommunications = (): InterAgentCommunication[] => [
  {
    id: "turn-1",
    author: "orchestrator",
    recipient: "subagent:protocol-test",
    content: "第一轮派发指令",
    triggerTurn: true,
  },
  {
    id: "done-1",
    author: "subagent:protocol-test",
    recipient: "orchestrator",
    content: "第一轮结论",
    triggerTurn: false,
  },
  {
    id: "turn-2",
    author: "orchestrator",
    recipient: "subagent:protocol-test",
    content: "第二轮派发指令",
    triggerTurn: true,
  },
  {
    id: "done-2",
    author: "subagent:protocol-test",
    recipient: "orchestrator",
    content: "第二轮结论",
    triggerTurn: false,
  },
]

// 子代理快照数据。
const buildSubagentData = (messages: AgentMessage[]): SubagentData => ({
  subagentId: "subagent-1789745938515-f9b34",
  name: "protocol-test",
  description: "协议轮次测试",
  prompt: "协议轮次测试",
  communications: buildCommunications(),
  messages,
  steps: [],
  usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15 },
})

// 父级 task 工具调用块。
const buildToolCall = (subagent: SubagentData): ToolCallBlock => ({
  kind: "toolCall",
  toolCallId: "task-call-1",
  toolName: "task",
  args: {},
  status: "done",
  subagent,
})

// 两轮完整消息：user 消息作为轮次分界。
const twoProtocolMessages = (): AgentMessage[] => [
  { role: "user", content: "第一轮派发指令", timestamp: 1000 },
  assistantMessage("第一轮执行内容", 1100),
  { role: "user", content: "第二轮派发指令", timestamp: 2000 },
  assistantMessage("第二轮执行内容", 2100),
]

describe("AgentSubagentPanel 协议轮次切换", () => {
  afterEach(cleanup)

  it("默认展示第一轮信元与执行内容，切换后只展示第二轮", () => {
    const { container } = render(
      <AgentSubagentPanel
        toolCall={buildToolCall(buildSubagentData(twoProtocolMessages()))}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText("1/2")).not.toBeNull()
    expect(container.querySelectorAll(".agent-subagent-comm-item")).toHaveLength(2)
    expect(screen.getByText("第一轮执行内容")).not.toBeNull()
    expect(screen.queryByText("第二轮执行内容")).toBeNull()
    expect((screen.getByLabelText("Previous Protocol") as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByLabelText("Next Protocol"))

    expect(screen.getByText("2/2")).not.toBeNull()
    expect(screen.queryByText("第一轮执行内容")).toBeNull()
    expect(screen.getByText("第二轮执行内容")).not.toBeNull()
    expect(container.querySelectorAll(".agent-subagent-comm-item")).toHaveLength(2)
    expect((screen.getByLabelText("Next Protocol") as HTMLButtonElement).disabled).toBe(true)
  })

  it("切换协议时滚动容器回到顶部", () => {
    const { container } = render(
      <AgentSubagentPanel
        toolCall={buildToolCall(buildSubagentData(twoProtocolMessages()))}
        onClose={vi.fn()}
      />,
    )

    const scrollContainer = container.querySelector(".custom-scrollbar") as HTMLDivElement
    scrollContainer.scrollTop = 120

    fireEvent.click(screen.getByLabelText("Next Protocol"))

    expect(scrollContainer.scrollTop).toBe(0)
  })

  it("flow 模式同样按协议轮次过滤执行流程", () => {
    render(
      <AgentSubagentPanel
        toolCall={buildToolCall(buildSubagentData(twoProtocolMessages()))}
        onClose={vi.fn()}
        mode="flow"
      />,
    )

    expect(screen.getAllByText("第一轮执行内容").length).toBeGreaterThan(0)
    expect(screen.queryAllByText("第二轮执行内容")).toHaveLength(0)

    fireEvent.click(screen.getByLabelText("Next Protocol"))

    expect(screen.getAllByText("第二轮执行内容").length).toBeGreaterThan(0)
    expect(screen.queryAllByText("第一轮执行内容")).toHaveLength(0)
  })

  it("无 triggerTurn 信元时不渲染切换控件并展示全部消息", () => {
    const subagent = buildSubagentData(twoProtocolMessages())
    subagent.communications = [
      {
        id: "done-only",
        author: "subagent:protocol-test",
        recipient: "orchestrator",
        content: "仅结果信元",
        triggerTurn: false,
      },
    ]

    const { container } = render(
      <AgentSubagentPanel toolCall={buildToolCall(subagent)} onClose={vi.fn()} />,
    )

    expect(screen.queryByLabelText("Next Protocol")).toBeNull()
    expect(container.querySelectorAll(".agent-subagent-comm-item")).toHaveLength(1)
    expect(screen.getByText("第一轮执行内容")).not.toBeNull()
    expect(screen.getByText("第二轮执行内容")).not.toBeNull()
  })

  it("轮次与 user 消息数不匹配时回退展示全部消息", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "第一轮派发指令", timestamp: 1000 },
      assistantMessage("第一轮执行内容", 1100),
      assistantMessage("第二轮执行内容", 2100),
    ]

    render(
      <AgentSubagentPanel
        toolCall={buildToolCall(buildSubagentData(messages))}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText("Next Protocol"))

    expect(screen.getByText("2/2")).not.toBeNull()
    expect(screen.getByText("第一轮执行内容")).not.toBeNull()
    expect(screen.getByText("第二轮执行内容")).not.toBeNull()
  })
})
