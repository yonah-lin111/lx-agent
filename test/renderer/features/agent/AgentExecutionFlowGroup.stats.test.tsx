// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowGroup } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowGroup"
import type { ExecutionStep } from "@/features/agent/types"

type StepSeed = Pick<ExecutionStep, "id" | "kind" | "title" | "status"> &
  Partial<Omit<ExecutionStep, "id" | "kind" | "title" | "status">>

let stepCursor = 0

const makeStep = (seed: StepSeed): ExecutionStep => {
  stepCursor++
  return {
    messageId: "msg-1",
    turnIndex: 1,
    stepIndex: stepCursor,
    timestamp: 1000 + stepCursor,
    ...seed,
  }
}

const toolStep = (id: string, toolName: string, status: ExecutionStep["status"] = "done") =>
  makeStep({
    id,
    kind: "tool",
    title: toolName,
    status,
    toolContent: { toolName, args: {} },
  })

const renderGroup = (steps: ExecutionStep[]): HTMLElement => {
  const { container } = render(
    <AgentExecutionFlowGroup
      groupId="group-1"
      steps={steps}
      isExpanded={false}
      onToggleExpand={vi.fn()}
      isStepExpanded={() => false}
      onToggleStepExpand={vi.fn()}
    />,
  )
  return container
}

const normalizeText = (text: string | null): string => (text ?? "").replace(/\s+/g, "")

describe("AgentExecutionFlowGroup 调用统计行", () => {
  afterEach(cleanup)

  it("按类型统计组内调用：思考、普通工具、技能、MCP 与联网搜索", () => {
    const steps = [
      makeStep({ id: "s1", kind: "thinking", title: "分析", status: "done" }),
      makeStep({ id: "s2", kind: "thinking", title: "规划", status: "done" }),
      toolStep("s3", "grep"),
      toolStep("s4", "read_skill"),
      toolStep("s5", "mcp__fs__read"),
      toolStep("s6", "web_search"),
    ]

    renderGroup(steps)

    const statsRow = screen.getByTestId("flow-group-stats")
    expect(normalizeText(statsRow.textContent)).toBe(
      "2Thoughts·1ToolCall·1SkillCall·1MCPCall·1WebSearch",
    )
  })

  it("计数为 1 时使用单数文案，大于 1 时使用复数文案", () => {
    const steps = [
      makeStep({ id: "s1", kind: "thinking", title: "分析", status: "done" }),
      toolStep("s2", "grep"),
      toolStep("s3", "glob"),
    ]

    renderGroup(steps)

    const statsRow = screen.getByTestId("flow-group-stats")
    expect(normalizeText(statsRow.textContent)).toBe("1Thought·2ToolCalls")
  })

  it("webfetch 计入 Web Search 而非普通 Tool Call", () => {
    renderGroup([toolStep("s1", "webfetch")])

    const statsRow = screen.getByTestId("flow-group-stats")
    expect(normalizeText(statsRow.textContent)).toBe("1WebSearch")
  })

  it("system / undo 步骤不产生统计段", () => {
    const steps = [
      makeStep({ id: "s1", kind: "system", title: "系统提示词", status: "done" }),
      makeStep({ id: "s2", kind: "undo", title: "撤销", status: "done" }),
      makeStep({ id: "s3", kind: "thinking", title: "分析", status: "done" }),
    ]

    renderGroup(steps)

    const statsRow = screen.getByTestId("flow-group-stats")
    expect(normalizeText(statsRow.textContent)).toBe("1Thought")
  })

  it("组内无调用类步骤时不渲染统计行", () => {
    renderGroup([
      makeStep({ id: "s1", kind: "system", title: "系统提示词", status: "done" }),
      makeStep({ id: "s2", kind: "undo", title: "撤销", status: "done" }),
    ])

    expect(screen.queryByTestId("flow-group-stats")).toBeNull()
  })

  it("运行中仍实时渲染统计行", () => {
    const steps = [
      makeStep({ id: "s1", kind: "thinking", title: "分析", status: "running" }),
      toolStep("s2", "mcp__fs__list", "running"),
    ]

    renderGroup(steps)

    const statsRow = screen.getByTestId("flow-group-stats")
    expect(normalizeText(statsRow.textContent)).toBe("1Thought·1MCPCall")
  })

  it("统计行位于头部摘要与展开体之间且默认折叠时可见", () => {
    const steps = [toolStep("s1", "grep"), toolStep("s2", "glob")]

    const container = renderGroup(steps)

    const statsRow = screen.getByTestId("flow-group-stats")
    const header = container.querySelector(".agent-execution-flow-group-header")
    expect(header).not.toBeNull()
    const position = header ? header.compareDocumentPosition(statsRow) : 0
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelector(".agent-execution-flow-group-body")).toBeNull()
    expect(statsRow.className).toContain("agent-execution-flow-group-stats-row")
  })
})
