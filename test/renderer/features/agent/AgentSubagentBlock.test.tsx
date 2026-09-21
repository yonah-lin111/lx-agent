// @vitest-environment jsdom

import type { SubagentData, SubagentStep } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentSubagentBlock } from "@/features/agent/components/blocks"
import type { ChatBlock } from "@/features/agent/types"

// 子代理调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 工具结果块类型。
type ToolResultBlock = Extract<ChatBlock, { kind: "toolResult" }>

// 子代理快照（含内部步骤与一条思考消息）。
const buildSubagent = (steps: SubagentStep[]): SubagentData => ({
  subagentId: "subagent-1789745938515-f9b34",
  name: "explore-agent",
  description: "调研任务",
  prompt: "调研任务",
  messages: [
    {
      role: "assistant",
      content: [{ type: "thinking", thinking: "先看目录结构" }],
      provider: "p",
      model: "m",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
      stopReason: "stop",
      timestamp: 1,
    },
  ],
  steps,
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
})

// 父级 task 工具调用块。
const buildToolCall = (status: ToolCallBlock["status"], steps: SubagentStep[]): ToolCallBlock => ({
  kind: "toolCall",
  toolCallId: "task-call-1",
  toolName: "task",
  args: { description: "调研任务" },
  status,
  subagent: buildSubagent(steps),
})

// 配对的 task 工具结果块。
const buildToolResult = (isError = false): ToolResultBlock => ({
  kind: "toolResult",
  toolCallId: "task-call-1",
  toolName: "task",
  text: "子代理输出",
  isError,
})

describe("AgentSubagentBlock 状态行", () => {
  afterEach(cleanup)

  it("运行中显示当前正在执行的内部工具，不显示统计", () => {
    const { container } = render(
      <AgentSubagentBlock
        toolCall={buildToolCall("running", [
          { toolName: "grep", args: { pattern: "ipc", path: "src" }, status: "done" },
          { toolName: "read", args: { filePath: "/tmp/a/SessionRunner.ts" }, status: "running" },
        ])}
      />,
    )

    const row = container.querySelector(".agent-subagent-status-row")
    expect(row?.getAttribute("data-subagent-row")).toBe("tool")
    expect(row?.textContent).toContain("read")
    expect(row?.textContent).toContain("SessionRunner.ts")
    expect(container.querySelector(".agent-subagent-stats")).toBeNull()
  })

  it("完成后显示统计行，描述行与状态行已移除", () => {
    const { container } = render(
      <AgentSubagentBlock
        toolCall={buildToolCall("done", [
          { toolName: "grep", args: {}, status: "done" },
          { toolName: "mcp__lx__search", args: {}, status: "done" },
        ])}
      />,
    )

    const row = container.querySelector(".agent-subagent-status-row")
    expect(row?.getAttribute("data-subagent-row")).toBe("stats")
    expect(row?.textContent).toContain("1Tool Call")
    expect(row?.textContent).toContain("1Thought")
    expect(row?.textContent).toContain("1MCP Call")
    expect(container.querySelector(".agent-subagent-desc-row")).toBeNull()
    expect(container.querySelector(".agent-subagent-error")).toBeNull()
  })

  it("恢复会话：toolCall 仍为 running 但存在配对 toolResult 时按完成展示统计", () => {
    const { container } = render(
      <AgentSubagentBlock
        toolCall={buildToolCall("running", [
          { toolName: "grep", args: {}, status: "done" },
          { toolName: "mcp__lx__search", args: {}, status: "done" },
        ])}
        toolResult={buildToolResult()}
      />,
    )

    const row = container.querySelector(".agent-subagent-status-row")
    expect(row?.getAttribute("data-subagent-row")).toBe("stats")
    expect(row?.textContent).toContain("1Tool Call")
    expect(row?.textContent).toContain("1MCP Call")
  })

  it("错误状态在统计行前置 Error 标记", () => {
    const { container } = render(
      <AgentSubagentBlock
        toolCall={buildToolCall("running", [{ toolName: "grep", args: {}, status: "error" }])}
        toolResult={buildToolResult(true)}
      />,
    )

    const stats = container.querySelector(".agent-subagent-stats")
    expect(stats?.textContent).toContain("Error")
    expect(stats?.textContent).toContain("1Tool Call")
  })

  it("点击名称触发打开面板回调", () => {
    const onOpen = vi.fn()
    render(<AgentSubagentBlock toolCall={buildToolCall("done", [])} onOpen={onOpen} />)

    fireEvent.click(screen.getByLabelText("View subagent execution details"))

    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})

// 批量子代理快照（各自独立 id / 展示名 / 角色）。
const buildBatchItem = (id: string, name: string, roleName?: string): SubagentData => ({
  subagentId: id,
  name,
  ...(roleName ? { roleName } : {}),
  description: `${name} 任务`,
  prompt: `${name} 任务`,
  messages: [],
  steps: [{ toolName: "grep", args: {}, status: "done" }],
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
})

// 批量扇出 task 调用块（tasks[] 模式）。
const buildBatchToolCall = (): ToolCallBlock => ({
  kind: "toolCall",
  toolCallId: "task-batch-1",
  toolName: "task",
  args: { tasks: [] },
  status: "done",
  subagents: [
    buildBatchItem("subagent-1", "review-auth", "explorer"),
    buildBatchItem("subagent-2", "review-db"),
  ],
})

describe("AgentSubagentBlock 批量扇出", () => {
  afterEach(cleanup)

  it("逐项渲染子代理入口，点击携带对应下标打开面板", () => {
    const onOpen = vi.fn()
    const toolCall = buildBatchToolCall()
    render(<AgentSubagentBlock toolCall={toolCall} onOpen={onOpen} />)

    const buttons = screen.getAllByLabelText("View subagent execution details")
    expect(buttons).toHaveLength(2)
    expect(buttons[0]?.textContent).toContain("review-auth")
    expect(buttons[0]?.textContent).toContain("explorer")
    expect(buttons[1]?.textContent).toContain("review-db")

    fireEvent.click(buttons[1] as HTMLElement)

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(toolCall, 1)
  })

  it("批量项各自渲染状态行（运行中展示内部工具）", () => {
    const { container } = render(
      <AgentSubagentBlock
        toolCall={{
          ...buildBatchToolCall(),
          status: "running",
          subagents: [
            buildBatchItem("subagent-1", "review-auth", "explorer"),
            {
              ...buildBatchItem("subagent-2", "review-db"),
              steps: [{ toolName: "read", args: { filePath: "/tmp/a/db.ts" }, status: "running" }],
            },
          ],
        }}
      />,
    )

    const rows = container.querySelectorAll(".agent-subagent-status-row")
    expect(rows).toHaveLength(2)
    expect(rows[1]?.textContent).toContain("read")
  })

  it("按单项终态标记：已完成项展示统计行，未完成项保持运行态（不等整批）", () => {
    const { container } = render(
      <AgentSubagentBlock
        toolCall={{
          ...buildBatchToolCall(),
          status: "running",
          subagents: [
            {
              ...buildBatchItem("subagent-1", "review-auth", "explorer"),
              status: "done",
              steps: [{ toolName: "grep", args: {}, status: "done" }],
            },
            {
              ...buildBatchItem("subagent-2", "review-db"),
              status: "running",
              steps: [{ toolName: "read", args: { filePath: "/tmp/a/db.ts" }, status: "running" }],
            },
          ],
        }}
      />,
    )

    const rows = container.querySelectorAll(".agent-subagent-status-row")
    expect(rows[0]?.getAttribute("data-subagent-row")).toBe("stats")
    expect(rows[1]?.getAttribute("data-subagent-row")).toBe("tool")
    expect(rows[1]?.textContent).toContain("read")
  })

  it("单项子代理仍按原有卡片渲染（不进入批量分支）", () => {
    const onOpen = vi.fn()
    render(<AgentSubagentBlock toolCall={buildToolCall("done", [])} onOpen={onOpen} />)

    expect(screen.getAllByLabelText("View subagent execution details")).toHaveLength(1)
  })
})
