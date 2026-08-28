// @vitest-environment jsdom
import type { QuestionRequest } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowList } from "@/features/agent/components/AgentExecutionFlowList"
import type { ChatBlock, ChatMessage } from "@/features/agent/types"

describe("AgentExecutionFlowList", () => {
  afterEach(() => {
    cleanup()
  })
  it("空消息列表展示 Logo、当前模式说明与推荐问题卡片，并支持点击推荐问题", () => {
    const onSelectPrompt = vi.fn()
    render(<AgentExecutionFlowList messages={[]} onSelectPrompt={onSelectPrompt} />)

    expect(screen.getByText("LX Agent · Execution Flow View")).not.toBeNull()
    expect(
      screen.getByText("Flow Mode: Full system prompt assembly & tool execution traces"),
    ).not.toBeNull()
    expect(
      screen.queryByText("Q&A Mode: Focused conversational chat & code interactions"),
    ).toBeNull()
    expect(screen.getByText("Execution Pipeline Preview")).not.toBeNull()
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

    const { container } = render(<AgentExecutionFlowList messages={messages} />)

    // 筛选 Tab 栏呈现总数与步骤标签
    expect(screen.getByRole("button", { name: /All \(4\)/ })).not.toBeNull()

    // 步骤标签与标题（用户步骤默认展开，因此标题与详情均含有文字，使用 getAllByText 验证）
    expect(screen.getAllByText("查找所有测试用例").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("Execute Group")).not.toBeNull()

    // 点击 Group 展开内部步骤
    const groupHeader = container.querySelector(".agent-execution-flow-group-header")
    expect(groupHeader).not.toBeNull()
    fireEvent.click(groupHeader!)

    expect(screen.getAllByText("MCP · search · code").length).toBeGreaterThanOrEqual(1)

    // 点击工具步骤头部展开详情
    const toolStepHeader = container.querySelector(
      '[data-step-kind="tool"] .agent-execution-flow-step-header',
    )
    expect(toolStepHeader).not.toBeNull()
    fireEvent.click(toolStepHeader!)

    // 展开后应显示输入参数与执行结果区域
    expect(screen.getByText("Input Arguments")).not.toBeNull()
    expect(screen.getByText("Execution Result")).not.toBeNull()
    expect(screen.getByText("found 12 files")).not.toBeNull()
  })

  it("render_svg, render_ascii, render_html 独立展示不折叠进 Group，且展开内容中置顶 Rendered Preview 并移除 Tag 和时间", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "绘制系统架构图" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "call-svg-1",
            toolName: "render_svg",
            args: { svg: "<svg><circle cx='50' cy='50' r='40'/></svg>" },
            status: "done",
          },
        ],
        isStreaming: false,
      },
      {
        id: "t1",
        role: "toolResult",
        blocks: [
          {
            kind: "toolResult",
            toolCallId: "call-svg-1",
            toolName: "render_svg",
            text: "SVG Rendered Successfully",
            isError: false,
          },
        ],
        isStreaming: false,
      },
    ]

    const { container } = render(<AgentExecutionFlowList messages={messages} isStreaming={false} />)

    // 不会被折叠进 Execute Group，而是独立展示为 Step
    expect(screen.queryByText("Execute Group")).toBeNull()
    expect(screen.getByText("render_svg")).not.toBeNull()

    // 最后一个 step 在完成态默认展开
    const visualPanel = container.querySelector(".agent-execution-flow-tool-visual")
    expect(visualPanel).not.toBeNull()

    // 展开内容中不包含 SVG Diagram tag 或 custom style tag，也不包含时间
    expect(visualPanel?.querySelector(".lx-tag")).toBeNull()

    // Rendered Preview 置于首位
    const previewHeader = screen.getByText("Rendered Preview")
    expect(previewHeader).not.toBeNull()
    expect(screen.getByText("Input Arguments")).not.toBeNull()
    expect(screen.getByText("Execution Result")).not.toBeNull()
    expect(screen.getByText("SVG Rendered Successfully")).not.toBeNull()
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

    // 初始展示所有步骤（用户步骤默认展开，使用 getAllByText 验证；思考与 bash 聚合为 Group）
    expect(screen.getAllByText("问答").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("Execute Group")).not.toBeNull()

    // 切换到工具筛选
    const toolFilterBtn = screen.getByRole("button", { name: /Tool Schema \(1\)/ })
    fireEvent.click(toolFilterBtn)

    // 分类筛选下为扁平单项展示：工具可见，用户输入不可见
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
            ...(pendingMessages[0]!.blocks[0] as Extract<ChatBlock, { kind: "toolCall" }>),
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

  it("进入时默认展开全部用户 item 与最后一个 turn 的最后一个 step，早期非用户步骤默认折叠，且手动操作状态得以保持", () => {
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

    // 全部用户 item 默认展开，展示在 userContent 中
    expect(screen.getByText("第一轮用户提问")).not.toBeNull()
    expect(screen.getByText("第二轮用户提问")).not.toBeNull()

    // 早期轮次（第一轮）助手步骤默认折叠：只在 title 中出现 1 次（不在 body 中展示）
    expect(screen.getAllByText("第一轮助手回复详细内容").length).toBe(1)

    // 思考过程作为中间步骤默认折叠：只在 title 中出现 1 次
    expect(screen.getAllByText("第一轮思考过程").length).toBe(1)
    expect(screen.getAllByText("第二轮思考过程").length).toBe(1)

    // 第二轮（最后一个 turn）的最后一个 step（助手回复）默认展开：title 和 markdown preview body 均出现（>=2）
    expect(screen.getAllByText("第二轮助手回复详细内容").length).toBeGreaterThanOrEqual(2)

    // 手动展开第一轮助手回复
    const firstAssistantStepHeader = screen.getAllByText("第一轮助手回复详细内容")[0]
    fireEvent.click(firstAssistantStepHeader)
    // 手动展开后详情内容出现
    expect(screen.getAllByText("第一轮助手回复详细内容").length).toBeGreaterThanOrEqual(2)

    // 新增第三轮消息后，第一轮手动展开的助手回复依然保持展开
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

    // 全部用户 item 保持展开
    expect(screen.getByText("第一轮用户提问")).not.toBeNull()
    expect(screen.getByText("第二轮用户提问")).not.toBeNull()
    expect(screen.getByText("第三轮用户提问")).not.toBeNull()

    // 第一轮手动展开的助手回复依然保持展开
    expect(screen.getAllByText("第一轮助手回复详细内容").length).toBeGreaterThanOrEqual(2)
    // 第二轮（非最后一个 turn 且未手动展开）自动折叠
    expect(screen.getAllByText("第二轮助手回复详细内容").length).toBe(1)
    // 第三轮（最后一个 turn）的最后一个 step 默认展开
    expect(screen.getAllByText("第三轮助手回复详细内容").length).toBeGreaterThanOrEqual(2)
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

  it("当 isStreaming 为 true 且当前无 running 步骤时，在底部展示骨架屏 loading 条目且左侧不展示数字 index，右侧展示 loading 图标", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "请帮我重构代码" }],
        isStreaming: false,
      },
    ]

    render(<AgentExecutionFlowList messages={messages} isStreaming={true} />)

    // 应渲染骨架屏加载条目，左侧不包含数字 index，右侧包含 loading 效果
    const skeleton = screen.getByTestId("flow-skeleton-loading")
    expect(skeleton).not.toBeNull()
    expect(skeleton.textContent).not.toContain("#1")
    expect(skeleton.querySelector(".animate-spin")).not.toBeNull()
  })

  it("当已有 running 状态的步骤且 isStreaming 为 true 时，仍始终在底部保留 loading 骨架条目", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "请帮我重构代码" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        isStreaming: true,
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "call-1",
            toolName: "bash",
            args: { command: "ls" },
            status: "running",
          },
        ],
      },
    ]

    render(<AgentExecutionFlowList messages={messages} isStreaming={true} />)

    // 既有 running 步骤，底部也保留 loading 骨架
    expect(screen.getByTestId("flow-skeleton-loading")).not.toBeNull()
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

  it("流式输出期间中间步骤默认折叠且支持中途手动点击展开，输出完成后自动展开最后一个步骤", () => {
    const streamingMessages: ChatMessage[] = [
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
          { kind: "thinking", text: "思考中详细过程..." },
          { kind: "text", text: "回复中详细内容..." },
        ],
        isStreaming: true,
      },
    ]

    const { rerender } = render(
      <AgentExecutionFlowList messages={streamingMessages} isStreaming={true} />,
    )

    // 流式状态下默认折叠
    expect(screen.queryByText("思考中详细过程...")).toBeNull()
    expect(screen.queryByText("回复中详细内容...")).toBeNull()

    // 中途手动点击思考步骤展开
    const thinkingHeader = screen.getAllByText("...")[0]
    fireEvent.click(thinkingHeader)

    // 中途展开后应能看到思考详情内容，不会被强制折叠
    expect(screen.getByText("思考中详细过程...")).not.toBeNull()

    // 输出完成（isStreaming = false）
    const completedMessages: ChatMessage[] = [
      streamingMessages[0]!,
      {
        ...streamingMessages[1]!,
        isStreaming: false,
      },
    ]

    rerender(<AgentExecutionFlowList messages={completedMessages} isStreaming={false} />)

    // 完成后自动展开最后一个步骤（assistant 回复详情出现在标题和展开体中）
    expect(screen.getAllByText("回复中详细内容...").length).toBeGreaterThanOrEqual(2)
    // 手动展开的思考步骤依然保持展开（标题和展开体均包含）
    expect(screen.getAllByText("思考中详细过程...").length).toBeGreaterThanOrEqual(2)
  })

  it("运行中的步骤左侧不展示数字 index，右侧展示 loading 图标，完成后恢复数字 index", () => {
    const runningMessages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "开始测试" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "call-run",
            toolName: "bash",
            args: { cmd: "npm test" },
            status: "running",
          },
        ],
        isStreaming: true,
      },
    ]

    const { rerender, container } = render(
      <AgentExecutionFlowList messages={runningMessages} isStreaming={true} />,
    )

    // 步骤为 running 状态，左侧不显示 #1，右侧应有 animate-spin 图标
    expect(screen.queryByText("#1")).toBeNull()
    const runningSpinners = container.querySelectorAll(".animate-spin")
    expect(runningSpinners.length).toBeGreaterThanOrEqual(1)

    // 步骤完成
    const doneMessages: ChatMessage[] = [
      runningMessages[0]!,
      {
        id: "a1",
        role: "assistant",
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "call-run",
            toolName: "bash",
            args: { cmd: "npm test" },
            status: "done",
          },
        ],
        isStreaming: false,
      },
      {
        id: "t1",
        role: "toolResult",
        blocks: [
          {
            kind: "toolResult",
            toolCallId: "call-run",
            toolName: "bash",
            text: "all passed",
            isError: false,
          },
        ],
        isStreaming: false,
      },
    ]

    rerender(<AgentExecutionFlowList messages={doneMessages} isStreaming={false} />)

    // 完成后应出现数字 index #1
    expect(screen.getByText("#1")).not.toBeNull()
  })

  it("用户向上滚动离开底部后，Agent 添加新的 step 消息不会强制滚动到底部", () => {
    const initialMessages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "查找文件" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "c1",
            toolName: "ls",
            args: {},
            status: "done",
          },
        ],
        isStreaming: false,
      },
    ]

    const { container, rerender } = render(<AgentExecutionFlowList messages={initialMessages} />)
    const scrollContainer = container.querySelector(".custom-scrollbar") as HTMLDivElement
    expect(scrollContainer).not.toBeNull()

    // 模拟容器滚动属性
    Object.defineProperty(scrollContainer, "scrollHeight", { value: 1000, configurable: true })
    Object.defineProperty(scrollContainer, "clientHeight", { value: 300, configurable: true })
    Object.defineProperty(scrollContainer, "scrollTop", {
      value: 700,
      writable: true,
      configurable: true,
    })

    const scrollToSpy = vi.fn()
    scrollContainer.scrollTo = scrollToSpy

    // 模拟用户向上滚动：scrollTop 从 700 变为 200（离开底部）
    scrollContainer.scrollTop = 200
    fireEvent.scroll(scrollContainer)

    scrollToSpy.mockClear()

    // Agent 添加了新的 assistant / tool 消息
    const updatedMessages: ChatMessage[] = [
      ...initialMessages,
      {
        id: "t1",
        role: "toolResult",
        blocks: [
          {
            kind: "toolResult",
            toolCallId: "c1",
            toolName: "ls",
            text: "file1.ts\nfile2.ts",
            isError: false,
          },
        ],
        isStreaming: false,
      },
      {
        id: "a2",
        role: "assistant",
        blocks: [{ kind: "text", text: "已找到文件列表" }],
        isStreaming: false,
      },
    ]

    rerender(<AgentExecutionFlowList messages={updatedMessages} />)

    // 因为用户已离开底部，scrollTo 不应被强制触发滚动到底部
    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it("当 turn 结束时，默认展开该轮的最后一个步骤（无论其为 assistant 还是 tool 等类型）", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "执行终端命令" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        blocks: [
          { kind: "text", text: "好的，即将修改代码：" },
          {
            kind: "toolCall",
            toolCallId: "c-write",
            toolName: "write",
            args: { filePath: "src/main.ts" },
            status: "done",
          },
        ],
        isStreaming: false,
      },
      {
        id: "t1",
        role: "toolResult",
        blocks: [
          {
            kind: "toolResult",
            toolCallId: "c-write",
            toolName: "write",
            text: "saved successfully",
            isError: false,
          },
        ],
        isStreaming: false,
      },
    ]

    render(<AgentExecutionFlowList messages={messages} />)

    // 用户步骤默认展开
    expect(screen.getByText("执行终端命令")).not.toBeNull()

    // 助手文本作为中间步骤默认折叠（仅标题出现 1 次）
    expect(screen.getAllByText("好的，即将修改代码：").length).toBe(1)

    // 最后一个步骤为写操作 write 步骤，turn 结束后应默认展开其执行结果详情
    expect(screen.getByText("main.ts")).not.toBeNull()
    expect(screen.getByText("Execution Result")).not.toBeNull()
    expect(screen.getByText("saved successfully")).not.toBeNull()
  })

  it("用户和 AI item 展开后具有符合对应 item tag 颜色的背景样式与 class 标识", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "用户提问内容" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        blocks: [{ kind: "text", text: "助手回答内容" }],
        isStreaming: false,
      },
    ]

    const { container } = render(<AgentExecutionFlowList messages={messages} />)

    // 用户 step 具备 amber tag 对应的专属背景 class 与 data-tag-color / data-step-kind
    const userStep = container.querySelector('[data-step-kind="user"]')
    expect(userStep).not.toBeNull()
    expect(userStep?.getAttribute("data-tag-color")).toBe("amber")
    const userBody = userStep?.querySelector(".agent-execution-flow-step-body--user")
    expect(userBody).not.toBeNull()
    expect(userBody?.className).toContain("bg-amber-500/[0.05]")
    expect(userBody?.className).toContain("agent-execution-flow-step-body--amber")

    // AI step 具备 emerald tag 对应的专属背景 class 与 data-tag-color / data-step-kind
    const assistantStep = container.querySelector('[data-step-kind="assistant"]')
    expect(assistantStep).not.toBeNull()
    expect(assistantStep?.getAttribute("data-tag-color")).toBe("emerald")
    const assistantBody = assistantStep?.querySelector(".agent-execution-flow-step-body--assistant")
    expect(assistantBody).not.toBeNull()
    expect(assistantBody?.className).toContain("bg-emerald-500/[0.05]")
    expect(assistantBody?.className).toContain("agent-execution-flow-step-body--emerald")
  })

  it("非用户和非 AI item（如工具调用/思考等）使用默认中性背景色", () => {
    const messages: ChatMessage[] = [
      {
        id: "m1",
        role: "assistant",
        blocks: [
          { kind: "text", text: "正在处理..." },
          {
            kind: "toolCall",
            toolCallId: "call_1",
            toolName: "write",
            args: { filePath: "src/file1.txt" },
            status: "done",
          },
        ],
        isStreaming: false,
      },
    ]

    const { container } = render(<AgentExecutionFlowList messages={messages} />)

    // tool step 是最后一个 step，默认展开
    const toolStep = container.querySelector('[data-step-kind="tool"]')
    expect(toolStep).not.toBeNull()
    const toolBody = toolStep?.querySelector(".agent-execution-flow-step-body")
    expect(toolBody).not.toBeNull()
    expect(toolBody?.className).toContain("bg-black/25")
    expect(toolBody?.className).not.toContain("bg-sky-500")
  })

  it("思考与检索类步骤聚合为 Group 默认折叠，写操作（write/edit）保持独立展开/单条，并在 title 实时显示正在执行的 step", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "请帮我重构代码" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "call-1",
            toolName: "read",
            args: { filePath: "src/index.ts" },
            status: "done",
          },
          {
            kind: "toolCall",
            toolCallId: "call-2",
            toolName: "grep",
            args: { pattern: "calculate" },
            status: "running",
          },
          {
            kind: "toolCall",
            toolCallId: "call-3",
            toolName: "write",
            args: { filePath: "src/utils.ts" },
            status: "running",
          },
        ],
        isStreaming: true,
      },
    ]

    const { container } = render(<AgentExecutionFlowList messages={messages} isStreaming={true} />)

    // 前置的 read 与 grep 聚合为一个 Group 组件（共 2 项）
    const group = container.querySelector('[data-flow-group="true"]')
    expect(group).not.toBeNull()
    expect(screen.getByText("Execute Group")).not.toBeNull()
    expect(screen.getByText("(2)")).not.toBeNull()

    // 运行态下展示第二行（正在执行的 grep 步骤）
    expect(screen.getByText('"calculate"')).not.toBeNull()
    expect(group?.querySelector(".animate-spin")).not.toBeNull()

    // 默认折叠：内部的 read 不直接展示 body
    expect(group?.querySelector(".agent-execution-flow-group-body")).toBeNull()

    // 独立的写操作 write 步骤单独作为一个 step item（不在 Group 内部）
    const writeStep = container.querySelector('[data-step-kind="tool"]')
    expect(writeStep).not.toBeNull()
    expect(screen.getByText("utils.ts")).not.toBeNull()

    // 点击 Group 头部可以展开
    const groupHeader = group?.querySelector(".agent-execution-flow-group-header")
    expect(groupHeader).not.toBeNull()
    fireEvent.click(groupHeader!)

    // 展开后显示内部的 read，且容器包含最大高度与滚动条样式
    const body = group?.querySelector(".agent-execution-flow-group-body")
    expect(body).not.toBeNull()
    expect(body?.className).toContain("max-h-[360px]")
    expect(body?.className).toContain("overflow-y-auto")
    expect(screen.getByText("index.ts")).not.toBeNull()
  })

  it("用户步骤中包含附件文件时渲染图片缩略图与文件卡片", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "分析以下附件" }],
        files: [
          {
            name: "screenshot.png",
            path: "/path/to/screenshot.png",
            type: "image",
          },
          {
            name: "document.pdf",
            path: "/path/to/document.pdf",
            type: "text",
            extension: "PDF",
            size: "1.2 MB",
          },
        ],
        isStreaming: false,
      },
    ]

    const { container } = render(<AgentExecutionFlowList messages={messages} />)

    expect(screen.getByText("Attached Files:")).not.toBeNull()
    expect(screen.getByText("document.pdf")).not.toBeNull()
    expect(screen.getByText("PDF · 1.2 MB")).not.toBeNull()

    const img = container.querySelector('img[alt="screenshot.png"]') as HTMLImageElement | null
    expect(img).not.toBeNull()
    expect(img?.src).toContain("lx-image://local/path/to/screenshot.png")
  })

  it("当步骤元素数量超出滑动窗口初始大小时，渲染折叠历史按钮并支持点击展开更早步骤（含压缩消息）", () => {
    // 构造 10 轮（共 20 个 steps），超过默认 15 的初始窗口大小，中间插入压缩消息
    const messages: ChatMessage[] = []
    for (let i = 1; i <= 10; i++) {
      messages.push({
        id: `u-${i}`,
        role: "user",
        blocks: [{ kind: "text", text: `用户提问 ${i}` }],
        isStreaming: false,
      })
      if (i === 5) {
        messages.push({
          id: "compaction-1",
          role: "compactionSummary",
          blocks: [{ kind: "text", text: "已自动压缩前 5 轮上下文" }],
          summaryTokens: 120,
          isStreaming: false,
        })
      }
      messages.push({
        id: `a-${i}`,
        role: "assistant",
        blocks: [{ kind: "text", text: `助手回复 ${i}` }],
        isStreaming: false,
      })
    }

    render(<AgentExecutionFlowList messages={messages} />)

    // 应展示折叠历史按钮
    const loadMoreBtn = screen.getByText(/加载更早步骤/)
    expect(loadMoreBtn).not.toBeNull()
    expect(loadMoreBtn.textContent).toContain("个单元未展开")

    // 最早的第 1 轮步骤目前不在 DOM 中
    expect(screen.queryByText("用户提问 1")).toBeNull()
    // 最新的第 10 轮步骤在 DOM 中
    expect(screen.getByText("用户提问 10")).not.toBeNull()

    // 点击加载更早步骤（一次加载 15 个单元）
    fireEvent.click(loadMoreBtn)

    // 展开后最早的第 1 轮步骤已被渲染出来，压缩消息也正常呈现
    expect(screen.getByText("用户提问 1")).not.toBeNull()
    expect(screen.getAllByText("Context Compaction").length).toBeGreaterThanOrEqual(1)
  })

  it("当 turn 结束时，底部 turn summary 展示整个 turn 的运行时间而不是各 step 耗时直接累加", () => {
    const startTime = 1700000000000
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        timestamp: startTime,
        blocks: [{ kind: "text", text: "测试轮次耗时计算" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        timestamp: startTime + 2000,
        blocks: [
          { kind: "thinking", text: "正在思考", durationMs: 1500 },
          {
            kind: "toolCall",
            toolCallId: "c1",
            toolName: "search",
            args: { q: "test" },
            status: "done",
          },
        ],
        isStreaming: false,
      },
      {
        id: "t1",
        role: "toolResult",
        timestamp: startTime + 4000,
        blocks: [
          {
            kind: "toolResult",
            toolCallId: "c1",
            toolName: "search",
            text: "done",
            isError: false,
            durationMs: 500,
          },
        ],
        isStreaming: false,
      },
      {
        id: "a2",
        role: "assistant",
        timestamp: startTime + 6000,
        model: "claude-3-5-sonnet",
        durationMs: 1000,
        blocks: [{ kind: "text", text: "完成", durationMs: 1000 }],
        isStreaming: false,
      },
    ]

    render(<AgentExecutionFlowList messages={messages} />)

    // turn 1 从 u1 (timestamp: startTime) 到 a2 (timestamp: startTime + 6000 + durationMs: 1000 = 7000ms 跨度)
    // 整个 turn took 应为 7.0s（7000ms），而非简单的 step 耗时相加 (1500+500+1000=3000ms -> 3.0s)
    const turnSummary = screen.getByTestId("turn-summary-1")
    expect(turnSummary).not.toBeNull()
    expect(turnSummary.textContent).toContain("took 7.0s")
    expect(turnSummary.textContent).not.toContain("took 3.0s")
  })

  it("当 canContinue 为 true 且提供 onContinue 时在最后一轮渲染继续生成按钮并响应点击", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "继续写代码" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        stopReason: "length",
        blocks: [{ kind: "text", text: "这是被截断的输出" }],
        isStreaming: false,
      },
    ]

    const onContinue = vi.fn()
    render(
      <AgentExecutionFlowList
        messages={messages}
        canContinue={true}
        onContinue={onContinue}
      />,
    )

    const continueBtn = screen.getByRole("button", { name: /继续生成|Continue Generating/i })
    expect(continueBtn).not.toBeNull()
    fireEvent.click(continueBtn)
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it("当 canContinue 为 false 时不渲染继续生成按钮", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        blocks: [{ kind: "text", text: "完成的任务" }],
        isStreaming: false,
      },
      {
        id: "a1",
        role: "assistant",
        stopReason: "stop",
        blocks: [{ kind: "text", text: "这是完整的输出" }],
        isStreaming: false,
      },
    ]

    const onContinue = vi.fn()
    render(
      <AgentExecutionFlowList
        messages={messages}
        canContinue={false}
        onContinue={onContinue}
      />,
    )

    expect(
      screen.queryByRole("button", { name: /继续生成|Continue Generating/i }),
    ).toBeNull()
  })
})
