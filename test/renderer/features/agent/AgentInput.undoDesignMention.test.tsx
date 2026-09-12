// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agentApi } from "@/features/agent/api/agentApi"
import { AgentInput } from "@/features/agent/components/AgentInput"
import { cleanUserPrompt } from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import { useAgentChat } from "@/features/agent/hooks/useAgentChat"

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    send: vi.fn().mockResolvedValue({ ok: true }),
    restore: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn().mockReturnValue(() => {}),
    abort: vi.fn().mockResolvedValue({ ok: true }),
    deleteMessageTurn: vi.fn().mockResolvedValue({ ok: true }),
    undoCompaction: vi.fn().mockResolvedValue({ ok: true }),
    compact: vi.fn().mockResolvedValue({ ok: true }),
    restoreSession: vi.fn().mockResolvedValue({ ok: true, messages: [], todos: [] }),
    listPromptTemplates: vi.fn().mockResolvedValue([]),
    listSkills: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue({ disabled: [] }),
    getContextUsage: vi.fn().mockResolvedValue({ tokens: 100, contextWindow: 1000 }),
  },
}))

vi.mock("@/features/agent/api/promptHistoryApi", () => ({
  promptHistoryApi: {
    get: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue([]),
  },
}))

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

vi.stubGlobal("requestAnimationFrame", ((cb: () => void) => {
  cb()
  return 0
}) as typeof requestAnimationFrame)

describe("AgentInput /undo 撤销设计模式引用测试", () => {
  afterEach(() => {
    cleanup()
    frontDesignStore.clear()
    vi.clearAllMocks()
  })

  beforeEach(() => {
    frontDesignStore.clear()
    vi.clearAllMocks()
    vi.mocked(agentApi.listPromptTemplates).mockResolvedValue([])
    vi.mocked(agentApi.listSkills).mockResolvedValue([] as any)
  })

  it("cleanUserPrompt 应完整剥离 <referenced_design> 源代码块，保留 @design 引用和提示词", () => {
    const rawWithDesign = `<referenced_design id="m9-design-0" target="[data-design-id=el-mtu2h47r-49tez]" title="Frontend Prototype" mode="tailwindcss">
<global_styling_context>
  body { margin: 0; background: #fff; }
</global_styling_context>
<target_element selector="[data-design-id=el-mtu2h47r-49tez]">
  <div data-design-id="el-mtu2h47r-49tez" class="btn-primary">Click Me</div>
</target_element>
</referenced_design>

@design:m9-design-0#[data-design-id=el-mtu2h47r-49tez] (div) 请帮我把这个按钮背景改成深蓝色`

    const cleaned = cleanUserPrompt(rawWithDesign)

    expect(cleaned).toBe(
      "@design:m9-design-0#[data-design-id=el-mtu2h47r-49tez] (div) 请帮我把这个按钮背景改成深蓝色",
    )
    expect(cleaned).not.toContain("<referenced_design")
    expect(cleaned).not.toContain("</referenced_design>")
    expect(cleaned).not.toContain("<div data-design-id=")
    expect(cleaned).not.toContain("body { margin: 0; }")
  })

  it("使用 undoLastTurn 撤销包含设计引用的消息时，输入框回显剥离设计源码，保留引用标记", async () => {
    let eventHandler: any = null
    vi.mocked(agentApi.onEvent).mockImplementation((handler: any) => {
      eventHandler = handler
      return () => {}
    })

    const { result } = renderHook(() => useAgentChat())
    await act(async () => {})

    const rawInjectedUserText = `<referenced_design id="m9-design-0" target="[data-design-id=el-mtu2h47r-49tez]" title="Frontend Prototype" mode="tailwindcss">
<global_styling_context>
  body { background: #000; }
</global_styling_context>
<target_element selector="[data-design-id=el-mtu2h47r-49tez]">
  <div data-design-id="el-mtu2h47r-49tez" class="p-4 bg-red-500">Target</div>
</target_element>
</referenced_design>

@design:m9-design-0#[data-design-id=el-mtu2h47r-49tez] (div) 请调整内边距`

    // 模拟存在前置的第一轮对话，确保第二轮撤销后会话仍然保留撤销摘要卡片
    act(() => {
      eventHandler({
        type: "message_start",
        message: {
          role: "user",
          content: [{ type: "text", text: "第一轮基础需求" }],
          timestamp: 900,
        },
      })
      eventHandler({
        type: "message_start",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "第一轮已完成。" }],
          stopReason: "end_turn",
          timestamp: 901,
        },
      })
      // 第二轮带有设计源码引用的对话
      eventHandler({
        type: "message_start",
        message: {
          role: "user",
          content: [{ type: "text", text: rawInjectedUserText }],
          timestamp: 1000,
        },
      })
      eventHandler({
        type: "message_start",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "已为您调整内边距。" }],
          stopReason: "end_turn",
          timestamp: 1001,
        },
      })
    })

    expect(result.current.messages).toHaveLength(4)

    // 执行 /undo 撤销最近一轮对话
    act(() => {
      result.current.undoLastTurn()
    })

    // 校验输入框 inputText 回显内容：保留用户引用与指令，彻底剔除设计源码
    expect(result.current.inputText).toBe(
      "@design:m9-design-0#[data-design-id=el-mtu2h47r-49tez] (div) 请调整内边距",
    )
    expect(result.current.inputText).not.toContain("<referenced_design")
    expect(result.current.inputText).not.toContain("</referenced_design>")
    expect(result.current.inputText).not.toContain("bg-red-500")

    // 校验生成的 undoSummaryMessage 中的 userPrompt 也同步进行了清洗
    const summaryMsg = result.current.messages.find((m) => m.role === "undoSummary")
    expect(summaryMsg).toBeDefined()
    expect(summaryMsg?.undoPayload?.userPrompt).toBe(
      "@design:m9-design-0#[data-design-id=el-mtu2h47r-49tez] (div) 请调整内边距",
    )
    expect(summaryMsg?.undoPayload?.userPrompt).not.toContain("<referenced_design")
  })

  it("当带有设计引用的消息发送失败时，回显输入框也不包含设计源码", async () => {
    // 注册基准设计
    frontDesignStore.registerDesign({
      id: "m9-design-0",
      title: "Test Prototype",
      html: `<div data-design-id="el-mtu2h47r-49tez">Button</div>`,
      mode: "tailwindcss",
    })

    // 模拟 send 失败
    vi.mocked(agentApi.send).mockResolvedValue({ ok: false, error: "Queue full" } as any)

    const { result } = renderHook(() => useAgentChat())
    await act(async () => {})

    act(() => {
      result.current.setInputText(
        "@design:m9-design-0#[data-design-id=el-mtu2h47r-49tez] (div) 改变按钮颜色",
      )
    })

    await act(async () => {
      await result.current.sendMessage()
    })

    // 验证失败回显内容无设计源码
    expect(result.current.inputText).toBe(
      "@design:m9-design-0#[data-design-id=el-mtu2h47r-49tez] (div) 改变按钮颜色",
    )
    expect(result.current.inputText).not.toContain("<referenced_design")
  })

  it("AgentInput 组件接收清洗后的回显内容时，正确显示提示词并不包含源码", () => {
    const defaultProps = {
      inputText: "@design:m9-design-0#[data-design-id=el-mtu2h47r-49tez] (div) 请将样式改为深色",
      isStreaming: false,
      isCompacting: false,
      queuedCount: 0,
      queuedMessages: [],
      onInputChange: vi.fn(),
      onSend: vi.fn(),
      onStop: vi.fn(),
      onClear: vi.fn(),
      onUndo: vi.fn(),
      onCompact: vi.fn(),
      selectedModel: "test-model",
      onModelChange: vi.fn(),
      modelOptions: [{ label: "Group", options: [{ label: "Test Model", value: "test-model" }] }],
      hasModelOptions: true,
      worktreeOptions: null,
      onWorktreeSelect: vi.fn(),
      selectedFiles: [],
      onFilesChange: vi.fn(),
      supportsImages: true,
    }

    const { container } = render(<AgentInput {...defaultProps} />)

    const textContent = container.textContent || ""
    expect(textContent).toContain("@design:m9-design-0#[data-design-id=el-mtu2h47r-49tez] (div)")
    expect(textContent).toContain("请将样式改为深色")
    expect(textContent).not.toContain("<referenced_design")
  })
})
