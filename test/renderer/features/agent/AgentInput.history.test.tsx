// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { promptHistoryApi } from "@/features/agent/api/promptHistoryApi"
import { AgentInput } from "@/features/agent/components/AgentInput"

vi.mock("@/features/agent/api/promptHistoryApi", () => ({
  promptHistoryApi: { get: vi.fn(), add: vi.fn() },
}))

// jsdom 未实现布局/动画 API，用空实现代替。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)
vi.stubGlobal("requestAnimationFrame", (() => 0) as typeof requestAnimationFrame)

beforeAll(() => {
  const rect = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect
  Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => rect
})

const PLACEHOLDER = "给 LX Agent 发送消息..."

// 受控输入 harness：onInputChange 驱动本地 state，使 CodeMirror 内容变化可回写。
const renderInput = async (history: string[], initialText = "") => {
  vi.mocked(promptHistoryApi.get).mockResolvedValue(history)
  const onSend = vi.fn()
  const Harness = () => {
    const [text, setText] = useState(initialText)
    return (
      <AgentInput
        inputText={text}
        isStreaming={false}
        isCompacting={false}
        queuedCount={0}
        queuedMessages={[]}
        onInputChange={setText}
        onSend={onSend}
        onStop={vi.fn()}
        onClear={vi.fn()}
        onUndo={vi.fn()}
        onCompact={vi.fn()}
        selectedModel="m"
        onModelChange={vi.fn()}
        modelOptions={[{ label: "M", options: [{ label: "m", value: "m" }] }]}
        hasModelOptions
        worktreeOptions={null}
        onWorktreeSelect={vi.fn()}
        selectedFiles={[]}
        onFilesChange={vi.fn()}
        supportsImages={false}
        projectId="proj-1"
        projectPath="/proj"
      />
    )
  }
  render(<Harness />)
  await act(async () => {})
  const content = document.querySelector(".cm-content") as HTMLElement | null
  expect(content).not.toBeNull()
  return { content: content as HTMLElement, onSend }
}

describe("AgentInput 历史提示词键盘", () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.mocked(promptHistoryApi.get).mockReset()
    vi.mocked(promptHistoryApi.add).mockReset()
  })

  it("空输入 ↑ 进入历史，加载最近一条", async () => {
    const { content } = await renderInput(["第二条", "第一条"])

    fireEvent.keyDown(content, { key: "ArrowUp" })

    expect(content.textContent).toBe("第二条")
  })

  it("↑ 连续上翻到更旧，↓ 下翻恢复草稿", async () => {
    const { content } = await renderInput(["p2", "p1"])

    fireEvent.keyDown(content, { key: "ArrowUp" })
    fireEvent.keyDown(content, { key: "ArrowUp" })
    expect(content.textContent).toBe("p1")

    fireEvent.keyDown(content, { key: "ArrowDown" })
    fireEvent.keyDown(content, { key: "ArrowDown" })
    // 恢复空草稿：placeholder 重新出现。
    expect(content.querySelector(".cm-placeholder")).not.toBeNull()
  })

  it("有内容且光标在行首时 ↑ 进入历史，↓ 恢复草稿", async () => {
    const { content } = await renderInput(["p1"], "草稿")

    fireEvent.keyDown(content, { key: "ArrowUp" })
    expect(content.textContent).toBe("p1")

    fireEvent.keyDown(content, { key: "ArrowDown" })
    expect(content.textContent).toBe("草稿")
  })

  it("面板模式激活时 ↑ 不进入历史（/clear 命令面板接管）", async () => {
    const { content } = await renderInput(["p1"], "/clear")

    // 聚焦触发 syncPanels，激活 /clear 命令面板。
    fireEvent.focus(content)
    await act(async () => {})
    fireEvent.keyDown(content, { key: "ArrowUp" })

    // 命令面板被激活：input 内容不变，历史不介入。
    expect(content.textContent).toBe("/clear")
  })

  it("Enter 发送前记录历史并调用 onSend", async () => {
    vi.mocked(promptHistoryApi.add).mockResolvedValue(["已发送"])
    const { content, onSend } = await renderInput([], "你好")

    fireEvent.keyDown(content, { key: "Enter" })

    expect(onSend).toHaveBeenCalledTimes(1)
    expect(promptHistoryApi.add).toHaveBeenCalledWith("你好")
  })

  it("未输入内容时展示 placeholder 提示", async () => {
    await renderInput([])

    expect(screen.getByText(PLACEHOLDER)).not.toBeNull()
  })

  it("点击扩大按钮切换扩大/自适应高度", async () => {
    await renderInput([])

    const expandBtn = screen.getByRole("button", { name: "扩大输入框" })
    expect(expandBtn).not.toBeNull()

    fireEvent.click(expandBtn)

    const shrinkBtn = screen.getByRole("button", { name: "自适应高度" })
    expect(shrinkBtn).not.toBeNull()

    fireEvent.click(shrinkBtn)

    expect(screen.getByRole("button", { name: "扩大输入框" })).not.toBeNull()
  })
})
