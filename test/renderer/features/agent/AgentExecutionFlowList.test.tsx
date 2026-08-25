// @vitest-environment jsdom
import type { QuestionRequest } from "@shared/contracts/agent"
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

  it("鼠标选择执行流 question 选项时聚焦但不滚动，且仍可正常选中", () => {
    const question: QuestionRequest = {
      requestId: "request-1",
      toolCallId: "call-question",
      questions: [
        {
          question: "选择一个选项",
          options: [{ label: "选项 A" }, { label: "选项 B" }],
        },
      ],
      sessionId: null,
    }
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "开始问答" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "call-question",
            toolName: "question",
            args: { questions: question.questions },
            question,
            status: "running",
          },
        ],
        isStreaming: true,
      },
    ]

    render(<AgentExecutionFlowList messages={messages} />)
    const option = screen.getByLabelText("选项 A")
    const focus = vi.fn()
    Object.defineProperty(option, "focus", { value: focus })

    expect(fireEvent.mouseDown(option)).toBe(false)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    fireEvent.click(option)

    expect((option as HTMLInputElement).checked).toBe(true)
  })

  it("question 挂起时默认展开，完成后折叠且仍可手动查看", () => {
    const question: QuestionRequest = {
      requestId: "request-1",
      toolCallId: "call-question",
      questions: [{ question: "选择一个选项", options: [{ label: "选项 A" }] }],
      sessionId: null,
    }
    const pendingMessages: ChatMessage[] = [
      {
        id: "a1",
        role: "assistant",
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "call-question",
            toolName: "question",
            args: { questions: question.questions },
            question,
            status: "running",
          },
        ],
        isStreaming: true,
      },
    ]
    const completedMessages: ChatMessage[] = [
      {
        ...pendingMessages[0]!,
        blocks: [
          {
            ...pendingMessages[0]!.blocks[0]!,
            question: undefined,
            status: "done",
          },
        ],
        isStreaming: false,
      },
    ]

    const { rerender } = render(<AgentExecutionFlowList messages={pendingMessages} />)
    expect(screen.getByText("选择一个选项").closest("[hidden]")).toBeNull()

    rerender(<AgentExecutionFlowList messages={completedMessages} />)
    const questionContent = screen.getByText("选择一个选项").closest("[hidden]")
    expect(questionContent).not.toBeNull()
    expect(questionContent?.hasAttribute("hidden")).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: /question/i }))
    expect(questionContent?.hasAttribute("hidden")).toBe(false)
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
    expect(
      screen.getAllByText("Network connection timeout to LLM provider").length,
    ).toBeGreaterThanOrEqual(2)
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

  it("当 isStreaming 为 true 且当前无 running 步骤时，在底部展示骨架屏 loading 条目", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "请帮我重构代码" }],
        isStreaming: false,
      },
    ]

    render(<AgentExecutionFlowList messages={messages} isStreaming={true} />)

    // 应渲染骨架屏加载条目
    const skeleton = screen.getByTestId("flow-skeleton-loading")
    expect(skeleton).not.toBeNull()
    expect(skeleton.textContent).toContain("#1")
  })

  it("在完成 turn 的底部展示该轮次的汇总指标统计（模型、工具数、token、缓存命中率、耗时等）", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "测试轮次统计" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        model: "claude-3-5-sonnet",
        durationMs: 800,
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "c1",
            toolName: "bash",
            args: { command: "echo 1" },
            status: "done",
          },
          { kind: "text", text: "执行完毕" },
        ],
        usage: {
          input: 1200,
          output: 300,
          cacheRead: 400,
          totalTokens: 1500,
        },
        isStreaming: false,
      },
      {
        id: "t1",
        role: "toolResult",
        blocks: [
          {
            kind: "toolResult",
            toolCallId: "c1",
            toolName: "bash",
            text: "1",
            isError: false,
            durationMs: 250,
          },
        ],
        isStreaming: false,
      },
    ]

    render(<AgentExecutionFlowList messages={messages} isStreaming={false} />)

    const summary = screen.getByTestId("turn-summary-1")
    expect(summary).not.toBeNull()
    expect(summary.textContent).toContain("claude-3-5-sonnet")
    expect(summary.textContent).toContain("1 tool calls")
    expect(summary.textContent).toContain("1.2k in")
    expect(summary.textContent).toContain("300 out")
    expect(summary.textContent).toContain("25% cache hit")
    expect(summary.textContent).toContain("took 1.1s")
  })

  it("read_skill 工具展示 read_skill 工具名前缀以及 skill 名称", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "调用技能" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "c-skill",
            toolName: "read_skill",
            args: { name: "grill-me" },
            status: "done",
          },
        ],
        isStreaming: false,
      },
    ]

    render(<AgentExecutionFlowList messages={messages} isStreaming={false} />)

    expect(screen.getByText("read_skill")).not.toBeNull()
    expect(screen.getByText("grill-me")).not.toBeNull()
  })

  it("loading 虚拟条目不会被计入顶部的总步骤统计中", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "测试中" }],
        isStreaming: false,
      },
    ]

    render(<AgentExecutionFlowList messages={messages} isStreaming={true} />)

    // 存在 loading 骨架
    expect(screen.getByTestId("flow-skeleton-loading")).not.toBeNull()
    // 顶部 All tab 统计仅计算真实 step 数量（user 步骤 1 个）
    expect(screen.getByText("All (1)")).not.toBeNull()
  })

  it("渲染思考步骤的耗时并在展开时显示思考内容", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "测试思考耗时" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        durationMs: 3200,
        blocks: [
          { kind: "thinking", text: "正在思考解决方案..." },
          { kind: "text", text: "思考完毕" },
        ],
        isStreaming: false,
      },
    ]

    render(<AgentExecutionFlowList messages={messages} />)

    // 头部耗时展示 (3.2s)
    const durationElements = screen.getAllByTestId("flow-item-duration")
    expect(durationElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("3.2s").length).toBeGreaterThanOrEqual(1)

    // 点击思考步骤展开详情
    const thinkingStep = screen.getByText("正在思考解决方案...")
    fireEvent.click(thinkingStep)

    // 展开后详情正常呈现内容
    expect(screen.getAllByText("正在思考解决方案...").length).toBeGreaterThanOrEqual(1)
  })

  it("流式输出期间思考步骤和 AI 步骤展示为 running 状态且禁止展开", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "流式测试" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        blocks: [
          { kind: "thinking", text: "思考中..." },
          { kind: "text", text: "回复中..." },
        ],
        isStreaming: true,
      },
    ]

    render(<AgentExecutionFlowList messages={messages} isStreaming={true} />)

    // 流式状态下展示为 "..." 占位
    const ellipsisElements = screen.getAllByText("...")
    expect(ellipsisElements.length).toBeGreaterThanOrEqual(2)
  })
})
