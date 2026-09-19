// @vitest-environment jsdom

import type { AgentMessage, SubagentData } from "@shared/contracts/agent"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentSubagentPanel } from "@/features/agent/components/panels/AgentSubagentPanel"
import type { ChatBlock } from "@/features/agent/types"

// 子代理调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 子代理内部消息：两次工具调用 + 匹配结果（flow 视图聚合为 Execute Group）。
const buildSubagentMessages = (): AgentMessage[] => [
  {
    role: "assistant",
    content: [
      { type: "toolCall", id: "call-1", name: "grep", arguments: { pattern: "ipc" } },
      { type: "toolCall", id: "call-2", name: "glob", arguments: { pattern: "*.ts" } },
    ],
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    usage: { input: 120, output: 30, cacheRead: 0, cacheWrite: 0, totalTokens: 150 },
    stopReason: "toolUse",
    timestamp: 1000,
  },
  {
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "grep",
    content: [{ type: "text", text: "1 match" }],
    isError: false,
    timestamp: 1100,
  },
  {
    role: "toolResult",
    toolCallId: "call-2",
    toolName: "glob",
    content: [{ type: "text", text: "3 files" }],
    isError: false,
    timestamp: 1200,
  },
]

// 子代理快照数据（含 ID、沙箱策略与两步已完成工具）。
const buildSubagentData = (): SubagentData => ({
  subagentId: "subagent-1789745938515-f9b34",
  name: "subagent-ipc-frontend",
  description: "检查 IPC 前端实现",
  prompt: "检查 IPC 前端实现",
  sandboxPolicy: "danger-full-access",
  messages: buildSubagentMessages(),
  steps: [
    { toolName: "grep", args: { pattern: "ipc" }, result: "1 match", status: "done" },
    { toolName: "glob", args: { pattern: "*.ts" }, result: "3 files", status: "done" },
  ],
  usage: { input: 120, output: 30, cacheRead: 0, cacheWrite: 0, totalTokens: 150 },
})

// 父级 task 工具调用块：status 即子代理运行信号。
const buildToolCall = (status: ToolCallBlock["status"]): ToolCallBlock => ({
  kind: "toolCall",
  toolCallId: "task-call-1",
  toolName: "task",
  args: { description: "检查 IPC 前端实现" },
  status,
  subagent: buildSubagentData(),
})

describe("AgentSubagentPanel 运行态与头部收敛", () => {
  afterEach(cleanup)

  it("QA 模式：子代理运行中在最后一条回复渲染加载指示", () => {
    const { container } = render(
      <AgentSubagentPanel toolCall={buildToolCall("running")} onClose={vi.fn()} />,
    )
    expect(container.querySelector(".lx-liquid-loader")).not.toBeNull()
  })

  it("QA 模式：子代理完成后不渲染加载指示", () => {
    const { container } = render(
      <AgentSubagentPanel toolCall={buildToolCall("done")} onClose={vi.fn()} />,
    )
    expect(container.querySelector(".lx-liquid-loader")).toBeNull()
  })

  it("Flow 模式：子代理运行中执行组展示运行状态", () => {
    render(<AgentSubagentPanel toolCall={buildToolCall("running")} onClose={vi.fn()} mode="flow" />)
    expect(screen.getByLabelText("Running")).not.toBeNull()
    expect(screen.queryByLabelText("Done")).toBeNull()
  })

  it("Flow 模式：子代理完成后执行组展示完成状态", () => {
    render(<AgentSubagentPanel toolCall={buildToolCall("done")} onClose={vi.fn()} mode="flow" />)
    expect(screen.getByLabelText("Done")).not.toBeNull()
    expect(screen.queryByLabelText("Running")).toBeNull()
  })

  it("头部：展示 ID 尾段与沙箱策略图标，完整策略文案作为可访问名", () => {
    render(<AgentSubagentPanel toolCall={buildToolCall("running")} onClose={vi.fn()} />)
    expect(screen.getByText("#f9b34")).not.toBeNull()
    expect(screen.getByLabelText("danger-full-access — Full Access (No Sandbox)")).not.toBeNull()
  })
})
