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

// 聚焦并等待面板状态同步。
const focusAndSync = async (content: HTMLElement) => {
  fireEvent.focus(content)
  await act(async () => {})
}

describe("AgentInput /historyPrompt 历史提示词面板", () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.mocked(promptHistoryApi.get).mockReset()
    vi.mocked(promptHistoryApi.add).mockReset()
  })

  it("输入 /historyPrompt 打开二级面板并按新→旧展示历史", async () => {
    const { content } = await renderInput(["最新提示词", "较旧提示词"], "/historyPrompt")
    await focusAndSync(content)

    const options = screen.getAllByRole("option")
    expect(options).toHaveLength(2)
    expect(options[0]?.textContent).toContain("最新提示词")
    expect(options[1]?.textContent).toContain("较旧提示词")
  })

  it("↑↓ 切换激活项，Enter 整体回填选中历史且面板关闭、不发送", async () => {
    const { content, onSend } = await renderInput(["最新提示词", "较旧提示词"], "/historyPrompt")
    await focusAndSync(content)

    fireEvent.keyDown(content, { key: "ArrowDown" })
    fireEvent.keyDown(content, { key: "Enter" })

    expect(content.textContent).toBe("较旧提示词")
    expect(onSend).not.toHaveBeenCalled()

    // 等待退场动画（120ms）结束后面板卸载。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150))
    })
    expect(screen.queryAllByRole("option")).toHaveLength(0)
  })

  it("/historyPrompt 后的文本作为模糊查询过滤历史", async () => {
    const { content } = await renderInput(["修复登录 bug", "重构面板"], "/historyPrompt 面板")
    await focusAndSync(content)

    const options = screen.getAllByRole("option")
    expect(options).toHaveLength(1)
    expect(options[0]?.textContent).toContain("重构面板")
  })

  it("历史为空时面板不出现，Enter 不发送命令文本并清空输入", async () => {
    const { content, onSend } = await renderInput([], "/historyPrompt")
    await focusAndSync(content)

    expect(screen.queryAllByRole("option")).toHaveLength(0)

    fireEvent.keyDown(content, { key: "Enter" })
    await act(async () => {})

    expect(onSend).not.toHaveBeenCalled()
    // 输入框已清空：CodeMirror 重新展示 placeholder。
    expect(content.querySelector(".cm-placeholder")).not.toBeNull()
  })

  it("从一级命令面板选中 /historyPrompt 后进入二级面板", async () => {
    const { content } = await renderInput(["甲提示词", "乙提示词"], "/hist")
    await focusAndSync(content)

    // 一级命令面板中出现 /historyPrompt，定位其索引后回车选中进入二级面板。
    const commandOptions = screen.getAllByRole("option")
    const targetIndex = commandOptions.findIndex((option) =>
      option.textContent?.includes("/historyPrompt"),
    )
    expect(targetIndex).toBeGreaterThanOrEqual(0)
    for (let i = 0; i < targetIndex; i++) {
      fireEvent.keyDown(content, { key: "ArrowDown" })
    }
    fireEvent.keyDown(content, { key: "Enter" })
    await act(async () => {})

    expect(content.textContent).toBe("/historyPrompt ")
    // 等待一级命令面板退场动画结束，仅剩二级历史面板。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150))
    })
    const options = screen.getAllByRole("option")
    expect(options).toHaveLength(2)
    expect(options[0]?.textContent).toContain("甲提示词")
  })

  it("多行历史：首行作标题、其余作单行预览", async () => {
    const { content } = await renderInput(["第一行\n第二行内容"], "/historyPrompt")
    await focusAndSync(content)

    const option = screen.getByRole("option")
    expect(option.textContent).toContain("第一行")
    expect(option.textContent).toContain("第二行内容")
  })
})
