// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { promptHistoryApi } from "@/features/agent/api/promptHistoryApi"
import { AgentInput } from "@/features/agent/components/AgentInput"

vi.mock("@/features/agent/api/promptHistoryApi", () => ({
  promptHistoryApi: { get: vi.fn(), add: vi.fn() },
}))

// jsdom 未实现 ResizeObserver / requestAnimationFrame，用空实现代替（AgentInput 定位与光标回位依赖）。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)
vi.stubGlobal("requestAnimationFrame", (() => 0) as typeof requestAnimationFrame)

const PLACEHOLDER = "给 LX Agent 发送消息..."

// 受控输入 harness：onInputChange 驱动本地 state，使导航后 textarea value 实际更新。
const renderInput = async (history: string[]) => {
  vi.mocked(promptHistoryApi.get).mockResolvedValue(history)
  const onSend = vi.fn()
  const Harness = () => {
    const [text, setText] = useState("")
    return (
      <AgentInput
        inputText={text}
        isStreaming={false}
        queuedCount={0}
        queuedMessages={[]}
        onInputChange={setText}
        onSend={onSend}
        onStop={vi.fn()}
        onClear={vi.fn()}
        onUndo={vi.fn()}
        selectedModel="m"
        onModelChange={vi.fn()}
        modelOptions={[{ label: "M", options: [{ label: "m", value: "m" }] }]}
        hasModelOptions
        pendingRequest={null}
        todos={[]}
        onPermissionRespond={vi.fn()}
        worktreeOptions={null}
        onWorktreeSelect={vi.fn()}
        projectId="proj-1"
        projectPath="/proj"
      />
    )
  }
  render(<Harness />)
  await act(async () => {})
  const textarea = screen.getByPlaceholderText(PLACEHOLDER) as HTMLTextAreaElement
  return { textarea, onSend }
}

describe("AgentInput 历史提示词键盘", () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.mocked(promptHistoryApi.get).mockReset()
    vi.mocked(promptHistoryApi.add).mockReset()
  })

  it("空输入 ↑ 进入历史，加载最近一条", async () => {
    const { textarea } = await renderInput(["第二条", "第一条"])

    fireEvent.keyDown(textarea, { key: "ArrowUp" })

    expect(textarea.value).toBe("第二条")
  })

  it("↑ 连续上翻到更旧，↓ 下翻恢复草稿", async () => {
    const { textarea } = await renderInput(["p2", "p1"])

    fireEvent.keyDown(textarea, { key: "ArrowUp" })
    fireEvent.keyDown(textarea, { key: "ArrowUp" })
    expect(textarea.value).toBe("p1")

    fireEvent.keyDown(textarea, { key: "ArrowDown" })
    fireEvent.keyDown(textarea, { key: "ArrowDown" })
    expect(textarea.value).toBe("")
  })

  it("有内容且光标在行首时 ↑ 进入历史，↓ 恢复草稿", async () => {
    const { textarea } = await renderInput(["p1"])

    fireEvent.change(textarea, { target: { value: "草稿" } })
    textarea.setSelectionRange(0, 0)
    fireEvent.keyDown(textarea, { key: "ArrowUp" })
    expect(textarea.value).toBe("p1")

    fireEvent.keyDown(textarea, { key: "ArrowDown" })
    expect(textarea.value).toBe("草稿")
  })

  it("面板模式激活时 ↑ 不进入历史（/clear 命令面板接管）", async () => {
    const { textarea } = await renderInput(["p1"])

    fireEvent.change(textarea, { target: { value: "/clear" } })
    textarea.setSelectionRange(0, 0)
    fireEvent.keyDown(textarea, { key: "ArrowUp" })

    // 命令面板被激活：input 内容不变，历史不介入。
    expect(textarea.value).toBe("/clear")
  })

  it("Enter 发送前记录历史并调用 onSend", async () => {
    vi.mocked(promptHistoryApi.add).mockResolvedValue(["已发送"])
    const { textarea, onSend } = await renderInput([])

    fireEvent.change(textarea, { target: { value: "你好" } })
    fireEvent.keyDown(textarea, { key: "Enter" })

    expect(onSend).toHaveBeenCalledTimes(1)
    expect(promptHistoryApi.add).toHaveBeenCalledWith("你好")
  })
})
