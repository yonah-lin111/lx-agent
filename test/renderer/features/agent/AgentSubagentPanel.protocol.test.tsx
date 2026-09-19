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

// 轮次序号（中文数字，用于生成可读的轮次文案）。
const ROUND_LABELS = ["一", "二", "三"]

// 多轮协议信元：每轮 = 派发（triggerTurn）+ 结果。
const buildCommunications = (rounds: number): InterAgentCommunication[] =>
  Array.from({ length: rounds }, (_, index) => [
    {
      id: `turn-${index + 1}`,
      author: "orchestrator",
      recipient: "subagent:protocol-test",
      content: `第${ROUND_LABELS[index]}轮派发指令`,
      triggerTurn: true,
    },
    {
      id: `done-${index + 1}`,
      author: "subagent:protocol-test",
      recipient: "orchestrator",
      content: `第${ROUND_LABELS[index]}轮结论`,
      triggerTurn: false,
    },
  ]).flat()

// 多轮消息：user 消息作为轮次分界。
const buildMessages = (rounds: number): AgentMessage[] =>
  Array.from({ length: rounds }, (_, index) => [
    {
      role: "user" as const,
      content: `第${ROUND_LABELS[index]}轮派发指令`,
      timestamp: 1000 + index * 1000,
    },
    assistantMessage(`第${ROUND_LABELS[index]}轮执行内容`, 1100 + index * 1000),
  ]).flat()

// 子代理快照数据（快照为累计结果：包含截至该次调用的全部协议轮次）。
const buildSubagentData = (messages: AgentMessage[], rounds: number): SubagentData => ({
  subagentId: "subagent-1789745938515-f9b34",
  name: "protocol-test",
  description: "协议轮次测试",
  prompt: "协议轮次测试",
  communications: buildCommunications(rounds),
  messages,
  steps: [],
  usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15 },
})

// 父级 task 工具调用块。
const buildToolCall = (subagent: SubagentData, toolCallId = "task-call-1"): ToolCallBlock => ({
  kind: "toolCall",
  toolCallId,
  toolName: "task",
  args: {},
  status: "done",
  subagent,
})

// 渲染面板。
const renderPanel = (
  toolCall: ToolCallBlock | null,
  mode: "qa" | "flow" = "qa",
): ReturnType<typeof render> =>
  render(<AgentSubagentPanel toolCall={toolCall} onClose={vi.fn()} mode={mode} />)

describe("AgentSubagentPanel 协议轮次切换", () => {
  afterEach(cleanup)

  it("默认展示打开调用自身的轮次（快照最后一个 Protocol），可回退上一轮", () => {
    const { container } = renderPanel(buildToolCall(buildSubagentData(buildMessages(2), 2)))

    expect(screen.getByText("2/2")).not.toBeNull()
    expect(container.querySelectorAll(".agent-subagent-comm-item")).toHaveLength(2)
    expect(screen.getByText("第二轮执行内容")).not.toBeNull()
    expect(screen.queryByText("第一轮执行内容")).toBeNull()
    expect((screen.getByLabelText("Next Protocol") as HTMLButtonElement).disabled).toBe(true)

    // trigger 徽章位于标题行（标识当前展示的是派发轮次），不在折叠信元内。
    expect(container.querySelector(".agent-interagent-trigger")?.textContent).toBe("trigger")
    expect(container.querySelector(".agent-subagent-comm-trigger")).toBeNull()

    fireEvent.click(screen.getByLabelText("Previous Protocol"))

    expect(screen.getByText("1/2")).not.toBeNull()
    expect(screen.queryByText("第二轮执行内容")).toBeNull()
    expect(screen.getByText("第一轮执行内容")).not.toBeNull()
    expect(container.querySelectorAll(".agent-subagent-comm-item")).toHaveLength(2)
    expect((screen.getByLabelText("Previous Protocol") as HTMLButtonElement).disabled).toBe(true)
  })

  it("三轮快照默认落在最后一次派发，可逐轮回退与前进", () => {
    renderPanel(buildToolCall(buildSubagentData(buildMessages(3), 3)))

    expect(screen.getByText("3/3")).not.toBeNull()
    expect(screen.getByText("第三轮执行内容")).not.toBeNull()

    fireEvent.click(screen.getByLabelText("Previous Protocol"))
    expect(screen.getByText("2/3")).not.toBeNull()
    expect(screen.getByText("第二轮执行内容")).not.toBeNull()
    expect(screen.queryByText("第三轮执行内容")).toBeNull()

    fireEvent.click(screen.getByLabelText("Previous Protocol"))
    expect(screen.getByText("1/3")).not.toBeNull()
    expect(screen.getByText("第一轮执行内容")).not.toBeNull()
    expect((screen.getByLabelText("Previous Protocol") as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByLabelText("Next Protocol"))
    expect(screen.getByText("2/3")).not.toBeNull()
  })

  it("切换调用后回到该调用的默认轮次", () => {
    const first = buildToolCall(buildSubagentData(buildMessages(3), 3), "task-call-1")
    const second = buildToolCall(buildSubagentData(buildMessages(2), 2), "task-call-2")
    const { rerender } = renderPanel(first)

    fireEvent.click(screen.getByLabelText("Previous Protocol"))
    fireEvent.click(screen.getByLabelText("Previous Protocol"))
    expect(screen.getByText("1/3")).not.toBeNull()

    rerender(<AgentSubagentPanel toolCall={second} onClose={vi.fn()} />)

    expect(screen.getByText("2/2")).not.toBeNull()
    expect(screen.getByText("第二轮执行内容")).not.toBeNull()
  })

  it("收起面板后重新打开回到默认轮次", () => {
    const toolCall = buildToolCall(buildSubagentData(buildMessages(3), 3))
    const { rerender } = renderPanel(toolCall)

    fireEvent.click(screen.getByLabelText("Previous Protocol"))
    expect(screen.getByText("2/3")).not.toBeNull()

    rerender(<AgentSubagentPanel toolCall={null} onClose={vi.fn()} />)
    rerender(<AgentSubagentPanel toolCall={toolCall} onClose={vi.fn()} />)

    expect(screen.getByText("3/3")).not.toBeNull()
    expect(screen.getByText("第三轮执行内容")).not.toBeNull()
  })

  it("切换协议时滚动容器回到顶部", () => {
    const { container } = renderPanel(buildToolCall(buildSubagentData(buildMessages(2), 2)))

    const scrollContainer = container.querySelector(".custom-scrollbar") as HTMLDivElement
    scrollContainer.scrollTop = 120

    fireEvent.click(screen.getByLabelText("Previous Protocol"))

    expect(scrollContainer.scrollTop).toBe(0)
  })

  it("flow 模式同样按协议轮次过滤执行流程", () => {
    renderPanel(buildToolCall(buildSubagentData(buildMessages(2), 2)), "flow")

    expect(screen.getAllByText("第二轮执行内容").length).toBeGreaterThan(0)
    expect(screen.queryAllByText("第一轮执行内容")).toHaveLength(0)

    fireEvent.click(screen.getByLabelText("Previous Protocol"))

    expect(screen.getAllByText("第一轮执行内容").length).toBeGreaterThan(0)
    expect(screen.queryAllByText("第二轮执行内容")).toHaveLength(0)
  })

  it("无 triggerTurn 信元时不渲染切换控件并展示全部消息", () => {
    const subagent = buildSubagentData(buildMessages(2), 2)
    subagent.communications = [
      {
        id: "done-only",
        author: "subagent:protocol-test",
        recipient: "orchestrator",
        content: "仅结果信元",
        triggerTurn: false,
      },
    ]

    const { container } = renderPanel(buildToolCall(subagent))

    expect(screen.queryByLabelText("Next Protocol")).toBeNull()
    expect(container.querySelector(".agent-interagent-trigger")).toBeNull()
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

    renderPanel(buildToolCall(buildSubagentData(messages, 2)))

    expect(screen.getByText("2/2")).not.toBeNull()
    expect(screen.getByText("第一轮执行内容")).not.toBeNull()
    expect(screen.getByText("第二轮执行内容")).not.toBeNull()
  })
})
