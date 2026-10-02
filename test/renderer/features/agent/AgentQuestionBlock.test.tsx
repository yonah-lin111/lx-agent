// @vitest-environment jsdom
import type { QuestionAnswer } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AgentQuestionBlock } from "@/features/agent"
import type { ChatBlock } from "@/features/agent/types"
import {
  parseQuestionAnswersFromText,
  toAgentMessages,
  toChatMessage,
} from "@/features/agent/utils"

// jsdom 未实现 ResizeObserver，用 mock 避免报错。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

describe("AgentQuestionBlock 只读展示与答案恢复", () => {
  beforeEach(() => {
    cleanup()
  })

  it("已作答状态展开时能正确渲染问题与答案", () => {
    const toolCall: ToolCallBlock = {
      kind: "toolCall",
      toolCallId: "call-1",
      toolName: "question",
      status: "done",
      args: {
        questions: [
          {
            question: "你当前最常用排主要编程语言是什么？",
            options: [
              { label: "TypeScript", description: "带类型的 JS" },
              { label: "Rust", description: "系统级编程语言" },
            ],
          },
          {
            question: "你在前端项目中常用哪些技术/框架？（可多选）",
            multiSelect: true,
            options: [
              { label: "React", description: "组件化 UI 库" },
              { label: "Vue", description: "渐进式框架" },
            ],
          },
          {
            question: "如果还有其他想测试的交互或反馈，请在此输入（选填）：",
          },
        ],
      },
      answers: [
        {
          question: "你当前最常用排主要编程语言是什么？",
          answer: ["TypeScript"],
        },
        {
          question: "你在前端项目中常用哪些技术/框架？（可多选）",
          answer: ["React"],
        },
        {
          question: "如果还有其他想测试的交互或反馈，请在此输入（选填）：",
          answer: ["2222"],
        },
      ],
    }

    render(<AgentQuestionBlock toolCall={toolCall} />)

    // 默认折叠，点击展开
    const toggleButton = screen.getByRole("button", { name: /已回答问题|Question/i })
    fireEvent.click(toggleButton)

    // 问题与答案均应渲染在 DOM 中
    expect(screen.getByText("你当前最常用排主要编程语言是什么？")).not.toBeNull()
    expect(screen.getByText("TypeScript")).not.toBeNull()
    expect(screen.getByText("带类型的 JS")).not.toBeNull()

    expect(screen.getByText("你在前端项目中常用哪些技术/框架？（可多选）")).not.toBeNull()
    expect(screen.getByText("React")).not.toBeNull()
    expect(screen.getByText("组件化 UI 库")).not.toBeNull()

    expect(screen.getByText("如果还有其他想测试的交互或反馈，请在此输入（选填）：")).not.toBeNull()
    expect(screen.getByText("2222")).not.toBeNull()
  })

  it("parseQuestionAnswersFromText 从 toolResult 文本解析答案", () => {
    const text =
      'User answered: "你当前最常用排主要编程语言是什么？"="TypeScript", "你在前端项目中常用哪些技术/框架？（可多选）"="React", "如果还有其他想测试的交互或反馈，请在此输入（选填）："="2222". Continue with the answers.'

    const answers = parseQuestionAnswersFromText(text)
    expect(answers).toEqual([
      { question: "你当前最常用排主要编程语言是什么？", answer: ["TypeScript"] },
      { question: "你在前端项目中常用哪些技术/框架？（可多选）", answer: ["React"] },
      { question: "如果还有其他想测试的交互或反馈，请在此输入（选填）：", answer: ["2222"] },
    ])
  })

  it("toChatMessage 与 toAgentMessages 正确保留 answers 字段", () => {
    const answers: QuestionAnswer[] = [
      { question: "q1", answer: ["a1"] },
      { question: "q2", answer: ["a2", "b2"] },
    ]

    const chatMessage = toChatMessage(
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-1",
            name: "question",
            arguments: { questions: [{ question: "q1" }] },
            answers,
          },
        ],
        provider: "local",
        model: "local",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
        stopReason: "stop",
        timestamp: 12345,
      },
      false,
      "m1",
    )

    const toolCallBlock = chatMessage.blocks.find((b): b is ToolCallBlock => b.kind === "toolCall")
    expect(toolCallBlock?.answers).toEqual(answers)

    const restoredAgentMessages = toAgentMessages([chatMessage])
    expect(restoredAgentMessages).toHaveLength(1)
    const restoredAssistant = restoredAgentMessages[0]
    expect(restoredAssistant.role).toBe("assistant")
    if (restoredAssistant.role === "assistant") {
      const restoredToolCall = restoredAssistant.content.find(
        (c): c is Extract<typeof c, { type: "toolCall" }> => c.type === "toolCall",
      )
      expect(restoredToolCall?.answers).toEqual(answers)
    }
  })

  it("挂起状态下渲染 options 的 description 并具备自适应高度和顶部对齐类名", () => {
    const toolCall: ToolCallBlock = {
      kind: "toolCall",
      toolCallId: "call-pending-1",
      toolName: "question",
      status: "running",
      args: {},
      question: {
        requestId: "req-pending-1",
        toolCallId: "call-pending-1",
        sessionId: null,
        questions: [
          {
            question: "线框图布局是否满足设计要求？",
            options: [
              { label: "批准线框图并继续", description: "布局符合预期，可以进行后续页面开发" },
              { label: "需要调整线框图布局", description: "提出修改意见" },
            ],
          },
        ],
      },
    }

    const { container } = render(<AgentQuestionBlock toolCall={toolCall} />)

    expect(screen.getByText("批准线框图并继续")).not.toBeNull()
    expect(screen.getByText("布局符合预期，可以进行后续页面开发")).not.toBeNull()
    expect(screen.getByText("需要调整线框图布局")).not.toBeNull()
    expect(screen.getByText("提出修改意见")).not.toBeNull()

    const optionLabels = container.querySelectorAll(".agent-question-option")
    expect(optionLabels.length).toBe(2)
    for (const option of optionLabels) {
      expect(option.className).toContain("!items-start")
      expect(option.className).toContain("!h-auto")
      expect(option.className).toContain("min-h-[32px]")
    }
  })
})
