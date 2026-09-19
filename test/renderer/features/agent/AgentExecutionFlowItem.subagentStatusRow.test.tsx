// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowItem } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowItem"
import { AgentExecutionFlowList } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowList"
import type { ChatMessage, ExecutionStep, SubagentData, SubagentStep } from "@/features/agent/types"

const makeSubagentData = (
  steps: SubagentStep[],
  description = "定位子代理执行流展示链路",
): SubagentData => ({
  name: "explore-agent",
  description,
  prompt: "在 AgentExecutionFlowList 中定位子代理步骤的构建与展示链路",
  messages: [],
  steps,
  usage: { input: 1200, output: 300, cacheRead: 0, cacheWrite: 0, totalTokens: 1500 },
})

const makeSubagentStep = (
  seed: Partial<ExecutionStep> & Pick<ExecutionStep, "id" | "status">,
): ExecutionStep => ({
  messageId: "msg-1",
  turnIndex: 1,
  stepIndex: 1,
  kind: "subagent",
  title: "explore-agent",
  timestamp: 1000,
  subagentContent: { name: "explore-agent", subagent: makeSubagentData([]) },
  ...seed,
})

const renderItem = (step: ExecutionStep): ReturnType<typeof render> =>
  render(<AgentExecutionFlowItem step={step} isExpanded={false} onToggleExpand={vi.fn()} />)

describe("AgentExecutionFlowItem - subagent 头部状态行（运行中内部工具 / 完成后统计）", () => {
  afterEach(cleanup)

  it("运行中优先展示最近一个 running 的内部工具描述", () => {
    const step = makeSubagentStep({
      id: "step-subagent-1",
      status: "running",
      subagentContent: {
        name: "explore-agent",
        subagent: makeSubagentData([
          { toolName: "read", args: { filePath: "/repo/src/one.ts" }, status: "done" },
          {
            toolName: "bash",
            args: { command: "rtk rg -n CornerDownRight src" },
            status: "running",
          },
        ]),
      },
    })

    renderItem(step)

    const row = screen.getByTestId("flow-item-subagent-status")
    expect(within(row).getByText("rtk rg -n CornerDownRight src")).toBeDefined()
    expect(within(row).queryByText("one.ts")).toBeNull()
  })

  it("全部内部工具完成后改为展示调用统计行（不再显示最后一个工具描述）", () => {
    const step = makeSubagentStep({
      id: "step-subagent-2",
      status: "done",
      subagentContent: {
        name: "explore-agent",
        subagent: makeSubagentData([
          { toolName: "read", args: { filePath: "/repo/src/one.ts" }, status: "done" },
          {
            toolName: "grep",
            args: { pattern: "AgentExecutionFlow", path: "src/renderer" },
            status: "done",
          },
        ]),
      },
    })

    renderItem(step)

    const row = screen.getByTestId("flow-item-subagent-status")
    expect(row.getAttribute("data-subagent-row")).toBe("stats")
    expect(row.textContent).toContain("2Tool Calls")
    expect(within(row).queryByText("one.ts")).toBeNull()
  })

  it("失败状态在统计行前置 Error 标记", () => {
    const step = makeSubagentStep({
      id: "step-subagent-error",
      status: "error",
      subagentContent: {
        name: "explore-agent",
        subagent: makeSubagentData([
          { toolName: "bash", args: { command: "rtk rg subagent" }, status: "error" },
        ]),
      },
    })

    renderItem(step)

    const row = screen.getByTestId("flow-item-subagent-status")
    expect(row.getAttribute("data-subagent-row")).toBe("stats")
    expect(row.textContent).toContain("Error")
    expect(row.textContent).toContain("1Tool Call")
  })

  it("直角行布局与 AgentExecutionFlowGroup 统计行同构（占位 + 直角 icon + 文本）", () => {
    const step = makeSubagentStep({
      id: "step-subagent-3",
      status: "running",
      subagentContent: {
        name: "explore-agent",
        subagent: makeSubagentData([
          { toolName: "ls", args: { path: "src/renderer" }, status: "running" },
        ]),
      },
    })

    const { container } = renderItem(step)

    const row = screen.getByTestId("flow-item-subagent-status")
    expect(row.className).toContain("items-start")
    expect(row.className).toContain("gap-1.5")
    expect(row.firstElementChild?.className).toContain("w-3.5")
    expect(row.querySelector(".lucide-corner-down-right")).not.toBeNull()

    const header = container.querySelector(".agent-execution-flow-step-header")
    expect(header?.className).toContain("items-start")
  })

  it("subagent 无内部工具步骤时不渲染直角行", () => {
    const step = makeSubagentStep({ id: "step-subagent-4", status: "running" })

    renderItem(step)

    expect(screen.queryByTestId("flow-item-subagent-status")).toBeNull()
  })

  it("普通工具步骤不渲染 subagent 直角行", () => {
    const step: ExecutionStep = {
      id: "step-tool-1",
      messageId: "msg-1",
      turnIndex: 1,
      stepIndex: 2,
      kind: "tool",
      title: "grep",
      status: "running",
      timestamp: 1000,
      toolContent: { toolName: "grep", args: { pattern: "foo", path: "src" } },
    }

    renderItem(step)

    expect(screen.queryByTestId("flow-item-subagent-status")).toBeNull()
  })

  it("快照更新后直角行实时切换到新的内部工具描述", () => {
    const initial = makeSubagentStep({
      id: "step-subagent-live",
      status: "running",
      subagentContent: {
        name: "explore-agent",
        subagent: makeSubagentData([
          { toolName: "read", args: { filePath: "/repo/src/one.ts" }, status: "running" },
        ]),
      },
    })

    const { rerender } = renderItem(initial)

    expect(
      within(screen.getByTestId("flow-item-subagent-status")).getByText("one.ts"),
    ).toBeDefined()

    const next: ExecutionStep = {
      ...initial,
      subagentContent: {
        name: "explore-agent",
        subagent: makeSubagentData([
          { toolName: "read", args: { filePath: "/repo/src/one.ts" }, status: "done" },
          { toolName: "bash", args: { command: "rtk rg subagent" }, status: "running" },
        ]),
      },
    }

    rerender(<AgentExecutionFlowItem step={next} isExpanded={false} onToggleExpand={vi.fn()} />)

    const row = screen.getByTestId("flow-item-subagent-status")
    expect(within(row).getByText("rtk rg subagent")).toBeDefined()
    expect(within(row).queryByText("one.ts")).toBeNull()
  })

  it("并行批次末尾的 subagent 只保留右下角并行标识，不展示并行总计标注", () => {
    const step = makeSubagentStep({
      id: "step-subagent-parallel",
      status: "done",
      parallel: { index: 2, total: 2, batchId: "batch-1", batchIndex: 0 },
      tokens: { input: 4200, output: 180, cacheRead: 500, total: 4380 },
      subagentContent: {
        name: "explore-agent",
        subagent: makeSubagentData([
          { toolName: "bash", args: { command: "rtk rg done" }, status: "done" },
        ]),
      },
    })

    renderItem(step)

    const parallelBadge = screen.getByTestId("flow-item-parallel")
    expect(parallelBadge.textContent).toBe("Parallel 2/2")
    expect(screen.queryByTestId("flow-item-parallel-token-total")).toBeNull()
    expect(screen.getByText("IN 4.2k")).toBeDefined()
  })
})

describe("AgentExecutionFlowList - subagent 状态行集成", () => {
  afterEach(cleanup)

  it("从消息构建的 subagent 步骤实时展示内部工具描述", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "测试子代理执行流" }],
        isStreaming: false,
        timestamp: 1000,
      },
      {
        id: "a1",
        role: "assistant",
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "c1",
            toolName: "task",
            args: { name: "explore-agent", description: "定位子代理执行流展示链路" },
            status: "running",
            subagent: makeSubagentData([
              {
                toolName: "grep",
                args: { pattern: "AgentExecutionFlowList", path: "src/renderer" },
                status: "running",
              },
            ]),
          },
        ],
        isStreaming: true,
        timestamp: 1010,
      },
    ]

    render(<AgentExecutionFlowList messages={messages} isStreaming={true} />)

    const row = screen.getByTestId("flow-item-subagent-status")
    expect(within(row).getByText('"AgentExecutionFlowList"')).toBeDefined()
  })
})
