// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowPanel } from "@/features/agent/components/AgentExecutionFlowPanel"
import type { ChatMessage } from "@/features/agent/types"

describe("AgentExecutionFlowPanel", () => {
  afterEach(() => {
    cleanup()
  })
  it("空消息列表展示空状态提示", () => {
    render(<AgentExecutionFlowPanel isOpen={true} onClose={() => {}} messages={[]} />)

    expect(screen.getByText("No execution flow records")).not.toBeNull()
  })

  it("渲染执行步骤并支持点击展开详情", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "查找所有测试用例" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        blocks: [
          { kind: "thinking", text: "正在分析项目目录..." },
          {
            kind: "toolCall",
            toolCallId: "call-1",
            toolName: "search_code",
            args: { pattern: "describe" },
            status: "done",
          },
          { kind: "text", text: "测试用例检索完成。" },
        ],
        isStreaming: false,
      },
      {
        id: "t1",
        role: "toolResult",
        blocks: [
          {
            kind: "toolResult",
            toolCallId: "call-1",
            toolName: "search_code",
            text: "found 12 files",
            isError: false,
          },
        ],
        isStreaming: false,
      },
    ]

    const onClose = vi.fn()
    render(<AgentExecutionFlowPanel isOpen={true} onClose={onClose} messages={messages} />)

    // 标题与步骤数量
    expect(screen.getByText("Execution Flow")).not.toBeNull()
    expect(screen.getByText("4 steps")).not.toBeNull()

    // 步骤标签与标题
    expect(screen.getByText("查找所有测试用例")).not.toBeNull()
    expect(screen.getByText("Tool: search_code")).not.toBeNull()

    // 点击工具步骤展开详情
    const toolStep = screen.getByText("Tool: search_code")
    fireEvent.click(toolStep)

    // 展开后应显示输入参数与执行结果区域
    expect(screen.getByText("Input Arguments")).not.toBeNull()
    expect(screen.getByText("Execution Result")).not.toBeNull()
    expect(screen.getByText("found 12 files")).not.toBeNull()

    // 点击关闭按钮触发 onClose
    const closeBtn = screen.getByLabelText("Close Execution Flow")
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("支持筛选功能", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "问答" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        blocks: [
          { kind: "thinking", text: "思考中" },
          {
            kind: "toolCall",
            toolCallId: "call-1",
            toolName: "bash",
            args: { cmd: "ls" },
            status: "done",
          },
        ],
        isStreaming: false,
      },
    ]

    render(<AgentExecutionFlowPanel isOpen={true} onClose={() => {}} messages={messages} />)

    // 初始展示所有步骤
    expect(screen.getByText("问答")).not.toBeNull()
    expect(screen.getByText("Tool: bash")).not.toBeNull()

    // 切换到工具筛选
    const toolFilterBtn = screen.getByRole("button", { name: /Tools \(1\)/ })
    fireEvent.click(toolFilterBtn)

    // 工具可见，用户输入不可见
    expect(screen.getByText("Tool: bash")).not.toBeNull()
    expect(screen.queryByText("问答")).toBeNull()
  })
})
