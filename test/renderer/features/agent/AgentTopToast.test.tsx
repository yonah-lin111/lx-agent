// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LxAgentTopToast, LxToastProvider, useLxAgentToast } from "@/components/ui/LxToast"
import { AgentInput } from "@/features/agent/components/AgentInput"
import { AgentTabBar } from "@/features/agent/components/AgentTabBar"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"

vi.mock("@/features/agent/api/promptHistoryApi", () => ({
  promptHistoryApi: {
    get: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    listProjects: vi.fn().mockResolvedValue([]),
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

const defaultInputProps = {
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

const AgentPageMock = (): React.JSX.Element => {
  const { warning } = useLxAgentToast()

  return (
    <div className="agent-page-container relative">
      <LxAgentTopToast />
      <button type="button" onClick={() => warning("测试顶部栏下方警告")}>
        触发测试警告
      </button>
      <AgentInput {...defaultInputProps} />
    </div>
  )
}

describe("AgentTopToast 架构与组件测试", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("AgentInput 内部不再包含任何 toast 元素", () => {
    const { container } = render(
      <LxToastProvider>
        <AgentInput {...defaultInputProps} />
      </LxToastProvider>,
    )

    expect(container.querySelector(".lx-agent-input-toast")).toBeNull()
    expect(container.querySelector(".lx-agent-top-toast")).toBeNull()
  })

  it("AgentPageMock 顶部绝对定位容器正常捕获 useLxAgentToast 派发的消息", () => {
    render(
      <LxToastProvider>
        <AgentPageMock />
      </LxToastProvider>,
    )

    expect(screen.queryByText("测试顶部栏下方警告")).toBeNull()

    fireEvent.click(screen.getByText("触发测试警告"))
    const toast = screen.getByText("测试顶部栏下方警告")
    expect(toast).not.toBeNull()

    const topContainer = toast.closest(".lx-agent-top-toast")
    expect(topContainer).not.toBeNull()
    expect(topContainer?.getAttribute("data-toast-type")).toBe("warning")

    // 外层容器绝对定位在顶部中央
    const wrapperEl = toast.parentElement
    expect(wrapperEl?.className).toContain("absolute")
    expect(wrapperEl?.className).toContain("top-2")
    expect(wrapperEl?.className).toContain("left-1/2")
    expect(wrapperEl?.className).toContain("-translate-x-1/2")

    // 3秒后淡出
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(topContainer?.className).toContain("animate-toast-out")
  })

  it("AgentTabBar 触发的警告通过 useLxAgentToast 在顶部 LxAgentTopToast 中展示", () => {
    render(
      <LxToastProvider>
        <LxAgentTopToast />
        <AgentTabBar />
      </LxToastProvider>,
    )

    // 模拟 agentTabStore 达到 8 个 tabs 后新建
    vi.spyOn(agentTabStore, "createTab").mockReturnValue(null)

    const newTabBtn = screen.getByLabelText(/new tab|新建/i)
    fireEvent.click(newTabBtn)

    const toast = screen.getByText(/最多只能创建 8 个标签页|max.*tabs/i)
    expect(toast).not.toBeNull()
    expect(toast.closest(".lx-agent-top-toast")).not.toBeNull()
  })
})
