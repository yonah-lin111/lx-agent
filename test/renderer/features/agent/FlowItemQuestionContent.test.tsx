// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { FlowItemQuestionContent } from "@/features/agent/components/AgentExecutionFlowList/FlowItemQuestionContent"
import type { ExecutionToolContent } from "@/features/agent/types"

describe("FlowItemQuestionContent 参数折叠", () => {
  afterEach(cleanup)

  it("已完成状态下默认折叠原始入参与执行结果，点击后展开", () => {
    const content: ExecutionToolContent = {
      toolName: "question",
      args: {
        questions: [
          {
            question: "你希望使用哪种语言？",
            options: [{ label: "TypeScript" }, { label: "Rust" }],
          },
        ],
      },
      answers: [
        {
          question: "你希望使用哪种语言？",
          answer: ["TypeScript"],
        },
      ],
      result: '{"answers":[{"question":"你希望使用哪种语言？","answer":["TypeScript"]}]}',
      durationMs: 50,
      toolCallId: "call-question-1",
    }

    const { container } = render(<FlowItemQuestionContent content={content} />)

    // 问题与答案正常回显
    expect(screen.getByText("你希望使用哪种语言？")).not.toBeNull()
    expect(screen.getByText("→ TypeScript")).not.toBeNull()

    // 默认折叠，不渲染展开的参数背景容器
    expect(container.querySelector(".bg-black\\/40")).toBeNull()

    // 存在折叠切换按钮
    const toggleBtn = screen.getByText(/Raw Arguments & Result|原始参数与执行结果/i)
    expect(toggleBtn).not.toBeNull()

    // 点击展开
    fireEvent.click(toggleBtn)

    // 展开后可查看输入参数与执行结果
    expect(screen.getByText(/Input Arguments|输入参数|Tool Args|agent\.toolArgs/i)).not.toBeNull()
    expect(
      screen.getByText(/Execution Result|执行结果|Tool Result|agent\.toolResult/i),
    ).not.toBeNull()
    expect(screen.getByText(/ID: call-question-1/)).not.toBeNull()
  })

  it("挂起作答状态下默认折叠原始入参，点击后可展开", () => {
    const content: ExecutionToolContent = {
      toolName: "question",
      args: {
        questions: [
          {
            question: "请选择部署环境",
            options: [{ label: "Staging" }, { label: "Production" }],
          },
        ],
      },
      question: {
        requestId: "req-1",
        toolCallId: "call-question-1",
        sessionId: "session-1",
        questions: [
          {
            question: "请选择部署环境",
            options: [{ label: "Staging" }, { label: "Production" }],
          },
        ],
      },
    }

    const { container } = render(<FlowItemQuestionContent content={content} />)

    // 渲染挂起问题
    expect(screen.getByText("请选择部署环境")).not.toBeNull()

    // 默认折叠原始入参
    expect(container.querySelector(".bg-black\\/40")).toBeNull()

    // 点击展开
    const toggleBtn = screen.getByText(/Raw Arguments & Result|原始参数与执行结果/i)
    fireEvent.click(toggleBtn)

    // 展开后能看到参数
    expect(container.querySelector(".bg-black\\/40")).not.toBeNull()
  })
})
