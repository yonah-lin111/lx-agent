// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AgentExecutionFlowItem } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowItem"
import { FlowToolTodo } from "@/features/agent/components/AgentExecutionFlowList/tools/FlowToolTodo"
import type { ExecutionStep, ExecutionToolContent } from "@/features/agent/types"

describe("FlowToolTodo", () => {
  afterEach(cleanup)

  it("正确渲染结构化 Todo 列表条目与进度统计", () => {
    const toolContent: ExecutionToolContent = {
      toolName: "todowrite",
      args: {
        todos: [
          { content: "重构状态栏组件", status: "completed" },
          { content: "实现任务清单展开可读项", status: "in_progress" },
          { content: "补充单元测试", status: "pending" },
          { content: "废弃的历史任务", status: "cancelled" },
        ],
      },
      result: "Todo list (4 items):\n#1 [completed] 重构状态栏组件",
      durationMs: 120,
    }

    const { container } = render(<FlowToolTodo content={toolContent} />)

    // 进度与状态统计（仅头部保留进行中徽标，条目本身不带额外 tag）
    expect(screen.getByText(/1\/4/)).not.toBeNull()
    expect(screen.getAllByText(/In Progress|进行中/i).length).toBe(1)
    expect(screen.queryByText(/Pending|待办/i)).toBeNull()
    expect(screen.queryByText(/Cancelled|已取消/i)).toBeNull()

    // 各条目内容与状态
    expect(screen.getByText("重构状态栏组件")).not.toBeNull()
    expect(screen.getByText("实现任务清单展开可读项")).not.toBeNull()
    expect(screen.getByText("补充单元测试")).not.toBeNull()
    expect(screen.getByText("废弃的历史任务")).not.toBeNull()

    // 已完成和已取消项带有 line-through 样式
    expect(screen.getByText("重构状态栏组件").className).toContain("line-through")
    expect(screen.getByText("废弃的历史任务").className).toContain("line-through")

    // 默认不渲染原始 JSON 参数（已折叠）
    expect(container.querySelector(".bg-black\\/40")).toBeNull()

    // 点击展开原始调试信息
    const debugToggleBtn = screen.getByText(/Raw Arguments & Result|原始参数与执行结果/i)
    fireEvent.click(debugToggleBtn)

    // 展开后可查看输入参数与执行结果
    expect(screen.getByText(/Input Arguments|输入参数/i)).not.toBeNull()
    expect(screen.getByText(/Execution Result|执行结果/i)).not.toBeNull()
  })

  it("当清单为空或格式不合法时优雅降级", () => {
    const toolContent: ExecutionToolContent = {
      toolName: "todowrite",
      args: { todos: [] },
    }

    render(<FlowToolTodo content={toolContent} />)
    expect(screen.getByText(/No todo items|任务清单为空/i)).not.toBeNull()
  })

  it("AgentExecutionFlowItem 渲染 todowrite 工具步骤展开态与条目内容", () => {
    const step: ExecutionStep = {
      id: "step-todo-1",
      stepIndex: 3,
      turnIndex: 0,
      kind: "tool",
      title: "todowrite",
      status: "done",
      toolContent: {
        toolName: "todowrite",
        args: {
          todos: [{ content: "待完成的关键优化", status: "in_progress" }],
        },
      },
    }

    render(<AgentExecutionFlowItem step={step} isExpanded={true} onToggleExpand={() => {}} />)

    // 标题区包含 todowrite
    expect(screen.getAllByText("todowrite").length).toBeGreaterThan(0)
    // 展开区包含结构化任务项（标题与详情各包含一次）
    expect(screen.getAllByText("待完成的关键优化").length).toBe(2)
    // 带有专属主体样式 class
    expect(document.querySelector(".agent-execution-flow-step-body--todowrite")).not.toBeNull()
  })
})
