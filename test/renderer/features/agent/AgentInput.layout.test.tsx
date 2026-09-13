// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { promptHistoryApi } from "@/features/agent/api/promptHistoryApi"
import { AgentInput } from "@/features/agent/components/AgentInput"

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

describe("AgentInput 布局与操作按钮测试", () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.mocked(promptHistoryApi.get).mockResolvedValue([])
    vi.mocked(promptHistoryApi.add).mockResolvedValue([])
  })

  const defaultProps = {
    inputText: "测试消息",
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

  it("底栏操作区不再渲染扩大/自适应输入框按钮", () => {
    const { container } = render(<AgentInput {...defaultProps} />)

    // 不应存在 agent-input-expand-btn class
    const expandBtn = container.querySelector(".agent-input-expand-btn")
    expect(expandBtn).toBeNull()

    // 不应存在任何扩大/高度自适应相关的 aria-label
    expect(screen.queryByLabelText(/expand input/i)).toBeNull()
    expect(screen.queryByLabelText(/adaptive height/i)).toBeNull()
    expect(screen.queryByLabelText(/扩大输入框/)).toBeNull()
    expect(screen.queryByLabelText(/自适应高度/)).toBeNull()
  })

  it("发送按钮在非流式且有内容状态下正常展示且可用并能触发发送", () => {
    const onSend = vi.fn()
    const { container } = render(<AgentInput {...defaultProps} onSend={onSend} />)

    const sendBtn = container.querySelector(".agent-input-send-btn") as HTMLButtonElement | null
    expect(sendBtn).not.toBeNull()
    expect(sendBtn?.disabled).toBe(false)

    fireEvent.click(sendBtn!)
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it("流式生成中正常展示停止按钮且不出现扩大按钮", () => {
    const onStop = vi.fn()
    const { container } = render(
      <AgentInput {...defaultProps} isStreaming={true} onStop={onStop} />,
    )

    expect(container.querySelector(".agent-input-expand-btn")).toBeNull()
    const stopBtn = container.querySelector(".agent-input-stop-btn") as HTMLButtonElement | null
    expect(stopBtn).not.toBeNull()
    expect(stopBtn?.disabled).toBe(false)

    fireEvent.click(stopBtn!)
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it("思考等级以 LxTag 展示在模型选择器右侧，不内嵌在选择器内部", () => {
    const { container } = render(<AgentInput {...defaultProps} selectedVariant="low" />)

    const tag = container.querySelector(".lx-tag")
    expect(tag).not.toBeNull()
    expect(tag?.textContent).toBe("low")
    expect(container.querySelector(".agent-model-select .lx-tag")).toBeNull()
  })

  it("未选中思考等级时不展示等级标签", () => {
    const { container } = render(<AgentInput {...defaultProps} />)
    expect(container.querySelector(".lx-tag")).toBeNull()
  })
})
