// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowList } from "@/features/agent/components/AgentExecutionFlowList"
import type { ChatMessage } from "@/features/agent/types"

describe("AgentExecutionFlowList", () => {
  afterEach(() => {
    cleanup()
  })
  it("空消息列表展示 Logo、当前模式说明与推荐问题卡片，并支持点击推荐问题", () => {
    const onSelectPrompt = vi.fn()
    render(<AgentExecutionFlowList messages={[]} onSelectPrompt={onSelectPrompt} />)

    expect(screen.getByText("LX Agent")).not.toBeNull()
    expect(
      screen.getByText(
        "Your AI development assistant, ready to help with architecture, refactoring, and tests.",
      ),
    ).not.toBeNull()
    expect(
      screen.getByText("Flow Mode: Full system prompt assembly & tool execution traces"),
    ).not.toBeNull()
    expect(
      screen.queryByText("Q&A Mode: Focused conversational chat & code interactions"),
    ).toBeNull()
    expect(screen.getByText("Suggested Prompts")).not.toBeNull()
    expect(screen.getByText("Code Refactoring")).not.toBeNull()

    // 点击推荐问题
    const promptCard = screen.getByText("Code Refactoring")
    fireEvent.click(promptCard)

    expect(onSelectPrompt).toHaveBeenCalledTimes(1)
    expect(onSelectPrompt).toHaveBeenCalledWith(
      expect.stringContaining("Help me analyze and refactor"),
    )
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

    render(<AgentExecutionFlowList messages={messages} />)

    // 筛选 Tab 栏呈现总数与步骤标签
    expect(screen.getByRole("button", { name: /All \(4\)/ })).not.toBeNull()

    // 步骤标签与标题（用户步骤默认展开，因此标题与详情均含有文字，使用 getAllByText 验证）
    expect(screen.getAllByText("查找所有测试用例").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("MCP · search · code")).not.toBeNull()

    // 点击工具步骤展开详情
    const toolStep = screen.getByText("MCP · search · code")
    fireEvent.click(toolStep)

    // 展开后应显示输入参数与执行结果区域
    expect(screen.getByText("Input Arguments")).not.toBeNull()
    expect(screen.getByText("Execution Result")).not.toBeNull()
    expect(screen.getByText("found 12 files")).not.toBeNull()
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

    render(<AgentExecutionFlowList messages={messages} />)

    // 初始展示所有步骤（用户步骤默认展开，使用 getAllByText 验证）
    expect(screen.getAllByText("问答").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("bash")).not.toBeNull()

    // 切换到工具筛选
    const toolFilterBtn = screen.getByRole("button", { name: /Tool Schema \(1\)/ })
    fireEvent.click(toolFilterBtn)

    // 工具可见，用户输入不可见
    expect(screen.getByText("bash")).not.toBeNull()
    expect(screen.queryByText("问答")).toBeNull()
  })

  it("默认展开用户步骤与最后一轮 AI 回复，早期 AI 回复默认折叠，且手动操作状态得以保持", () => {
    const messages: ChatMessage[] = [
      // 第一轮
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "第一轮用户提问" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        blocks: [
          { kind: "thinking", text: "第一轮思考过程" },
          { kind: "text", text: "第一轮助手回复详细内容" },
        ],
        isStreaming: false,
      },
      // 第二轮
      {
        id: "u2",
        role: "user",
        blocks: [{ kind: "text", text: "第二轮用户提问" }],
        isStreaming: false,
      },
      {
        id: "a2",
        role: "assistant",
        blocks: [
          { kind: "thinking", text: "第二轮思考过程" },
          { kind: "text", text: "第二轮助手回复详细内容" },
        ],
        isStreaming: false,
      },
    ]

    const { rerender } = render(<AgentExecutionFlowList messages={messages} />)

    // 用户步骤：默认展开，展示在 userContent 中
    expect(screen.getByText("第一轮用户提问")).not.toBeNull()
    expect(screen.getByText("第二轮用户提问")).not.toBeNull()

    // 第一轮（非最后一轮）assistant 步骤默认折叠：只在 title 中出现 1 次（不在 body 中展示）
    expect(screen.getAllByText("第一轮助手回复详细内容").length).toBe(1)

    // 思考过程默认折叠：只在 title 中出现 1 次
    expect(screen.getAllByText("第一轮思考过程").length).toBe(1)
    expect(screen.getAllByText("第二轮思考过程").length).toBe(1)

    // 第二轮（最后一轮）assistant 步骤默认展开：title 和 markdown preview body 均出现（>=2）
    expect(screen.getAllByText("第二轮助手回复详细内容").length).toBeGreaterThanOrEqual(2)

    // 手动展开第一轮 assistant
    const firstAssistantStepHeader = screen.getAllByText("第一轮助手回复详细内容")[0]
    fireEvent.click(firstAssistantStepHeader)
    // 展开后其详情内容出现
    expect(screen.getAllByText("第一轮助手回复详细内容").length).toBeGreaterThanOrEqual(2)

    // 新增第三轮消息后，第一轮手动展开的 assistant 依然保持展开状态
    const updatedMessages: ChatMessage[] = [
      ...messages,
      {
        id: "u3",
        role: "user",
        blocks: [{ kind: "text", text: "第三轮用户提问" }],
        isStreaming: false,
      },
      {
        id: "a3",
        role: "assistant",
        blocks: [{ kind: "text", text: "第三轮助手回复详细内容" }],
        isStreaming: false,
      },
    ]

    rerender(<AgentExecutionFlowList messages={updatedMessages} />)

    // 第一轮 manually expanded 仍然保持展开
    expect(screen.getAllByText("第一轮助手回复详细内容").length).toBeGreaterThanOrEqual(2)
    // 第二轮（现在变成非最后一轮且未手动展开）自动变为折叠
    expect(screen.getAllByText("第二轮助手回复详细内容").length).toBe(1)
  })

  it("当存在上下文压缩步骤时，在 item 顶部展示分割线说明", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "历史长消息" }],
        isStreaming: false,
      },
      {
        id: "m-compact",
        role: "compactionSummary",
        blocks: [],
        isStreaming: false,
        isCompacting: true,
        compactionId: "cid-1",
        isManual: true,
      },
    ]

    render(<AgentExecutionFlowList messages={messages} />)

    expect(screen.getByText("Compressing context manually...")).not.toBeNull()
    expect(screen.getByLabelText("Running")).not.toBeNull()
    expect(
      screen.getByText((content, element) => {
        return (
          typeof element?.className === "string" &&
          element.className.includes("text-indigo-300/60") &&
          content.includes("Context Compaction")
        )
      }),
    ).not.toBeNull()
  })

  it("当出现异常停止或取消时，生成异常说明步骤 item 并默认展开", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "执行复杂计算" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        blocks: [{ kind: "text", text: "开始计算..." }],
        isStreaming: false,
        stopReason: "error",
        error: "Network connection timeout to LLM provider",
      },
    ]

    render(<AgentExecutionFlowList messages={messages} />)

    // 筛选 Tab 栏应显示异常筛选 Tab
    expect(screen.getByRole("button", { name: /Error \(1\)/ })).not.toBeNull()

    // 步骤标题与详情均展开展示错误内容
    expect(screen.getAllByText("Network connection timeout to LLM provider").length).toBeGreaterThanOrEqual(2)
  })

  it("当用户主动中止生成时，生成 Cancelled 步骤 item 并展示 aborted 原因", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "生成长篇小说" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        blocks: [{ kind: "text", text: "从前有座山..." }],
        isStreaming: false,
        stopReason: "aborted",
      },
    ]

    render(<AgentExecutionFlowList messages={messages} />)

    // 应展示 Generation cancelled 步骤与 Stop Reason: aborted
    expect(screen.getByText("Generation cancelled")).not.toBeNull()
    expect(screen.getByText("Generation was cancelled by user.")).not.toBeNull()
  })
})
