// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { promptHistoryApi } from "@/features/agent/api/promptHistoryApi"
import { AgentInput } from "@/features/agent/components/AgentInput"

vi.mock("@/features/agent/api/promptHistoryApi", () => ({
  promptHistoryApi: { get: vi.fn(), add: vi.fn() },
}))

// jsdom 未实现 ResizeObserver / requestAnimationFrame
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

describe("AgentInput Steer 与 Esc 键盘交互", () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.mocked(promptHistoryApi.get).mockReset()
    vi.mocked(promptHistoryApi.add).mockReset()
    vi.mocked(promptHistoryApi.get).mockResolvedValue([])
    vi.mocked(promptHistoryApi.add).mockResolvedValue([])
  })

  it("在流式运行状态下，Shift+Enter 触发 delivery='steer' 发送", async () => {
    const onSend = vi.fn()
    const onStop = vi.fn()

    const Harness = () => {
      const [text, setText] = useState("纠偏插话")
      return (
        <AgentInput
          inputText={text}
          isStreaming={true}
          isCompacting={false}
          queuedCount={0}
          queuedMessages={[]}
          onInputChange={setText}
          onSend={onSend}
          onStop={onStop}
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
        />
      )
    }

    render(<Harness />)
    await act(async () => {})
    const editor = document.querySelector(".cm-content") as HTMLElement
    expect(editor).not.toBeNull()

    fireEvent.keyDown(editor, { key: "Enter", shiftKey: true })
    expect(onSend).toHaveBeenCalledWith({ delivery: "steer" })
    // 发送后输入框顶部展示即时插话提示条（参考排队消息提示）。
    expect(screen.getByText("已发送即时插话，将在当前步骤完成后生效")).toBeDefined()
  })

  it("输入 /steer 命令发送时，自动转换为 delivery='steer'", async () => {
    const onSend = vi.fn()

    const Harness = () => {
      const [text, setText] = useState("/steer 改为直接回答")
      return (
        <AgentInput
          inputText={text}
          isStreaming={true}
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
        />
      )
    }

    render(<Harness />)
    await act(async () => {})
    const editor = document.querySelector(".cm-content") as HTMLElement
    expect(editor).not.toBeNull()

    fireEvent.keyDown(editor, { key: "Enter", shiftKey: false })
    expect(onSend).toHaveBeenCalledWith({ delivery: "steer" })
  })

  it("输入只有 /steer 无内容时，不能发送", async () => {
    const onSend = vi.fn()

    const Harness = () => {
      const [text, setText] = useState("/steer")
      return (
        <AgentInput
          inputText={text}
          isStreaming={true}
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
        />
      )
    }

    render(<Harness />)
    await act(async () => {})
    const editor = document.querySelector(".cm-content") as HTMLElement
    expect(editor).not.toBeNull()

    fireEvent.keyDown(editor, { key: "Enter", shiftKey: false })
    expect(onSend).not.toHaveBeenCalled()
  })

  it("在命令面板中按 Enter 选中 /steer 时回显 '/steer '", async () => {
    let updateText: (v: string) => void = () => {}
    let currentText = ""
    const Harness = () => {
      const [text, setText] = useState("")
      updateText = setText
      currentText = text
      return (
        <AgentInput
          inputText={text}
          isStreaming={true}
          isCompacting={false}
          queuedCount={0}
          queuedMessages={[]}
          onInputChange={setText}
          onSend={vi.fn()}
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
        />
      )
    }

    render(<Harness />)
    await act(async () => {})
    const editor = document.querySelector(".cm-content") as HTMLElement

    // 输入 "/st" 筛选到 /steer 并按 Enter
    await act(async () => {
      fireEvent.focus(editor)
      updateText("/st")
    })
    await act(async () => {})
    fireEvent.keyDown(editor, { key: "Enter" })

    expect(currentText).toBe("/steer ")
  })

  it("steer 内容不写入历史提示词（普通发送正常记录）", async () => {
    const Harness = () => {
      const [text, setText] = useState("/steer 插话内容")
      return (
        <AgentInput
          inputText={text}
          isStreaming={true}
          isCompacting={false}
          queuedCount={0}
          queuedMessages={[]}
          onInputChange={setText}
          onSend={vi.fn()}
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
        />
      )
    }

    render(<Harness />)
    await act(async () => {})
    const editor = document.querySelector(".cm-content") as HTMLElement

    // 触发 steer 发送：不记录历史。
    fireEvent.keyDown(editor, { key: "Enter", shiftKey: false })
    expect(vi.mocked(promptHistoryApi.add)).not.toHaveBeenCalled()
  })

  it("普通消息发送会写入历史提示词", async () => {
    const Harness = () => {
      const [text, setText] = useState("普通问题")
      return (
        <AgentInput
          inputText={text}
          isStreaming={false}
          isCompacting={false}
          queuedCount={0}
          queuedMessages={[]}
          onInputChange={setText}
          onSend={vi.fn()}
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
        />
      )
    }

    render(<Harness />)
    await act(async () => {})
    const editor = document.querySelector(".cm-content") as HTMLElement

    fireEvent.keyDown(editor, { key: "Enter", shiftKey: false })
    expect(vi.mocked(promptHistoryApi.add)).toHaveBeenCalledWith("普通问题")
  })

  it("Esc 分级机制：有草稿内容时 Esc 优先清空输入，不触发 onStop", async () => {
    const onStop = vi.fn()
    let currentVal = "待清空草稿"

    const Harness = () => {
      const [text, setText] = useState(currentVal)
      return (
        <AgentInput
          inputText={text}
          isStreaming={true}
          isCompacting={false}
          queuedCount={0}
          queuedMessages={[]}
          onInputChange={(v) => {
            currentVal = v
            setText(v)
          }}
          onSend={vi.fn()}
          onStop={onStop}
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
        />
      )
    }

    render(<Harness />)
    await act(async () => {})
    const editor = document.querySelector(".cm-content") as HTMLElement

    fireEvent.keyDown(editor, { key: "Escape" })
    expect(currentVal).toBe("")
    expect(onStop).not.toHaveBeenCalled()
  })

  it("Esc 分级机制：输入为空且流式运行时，单按只提示、双击 Esc 才触发 onStop", async () => {
    const onStop = vi.fn()

    const Harness = () => {
      return (
        <AgentInput
          inputText=""
          isStreaming={true}
          isCompacting={false}
          queuedCount={0}
          queuedMessages={[]}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
          onStop={onStop}
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
        />
      )
    }

    render(<Harness />)
    await act(async () => {})
    const editor = document.querySelector(".cm-content") as HTMLElement

    // 第一次按 Esc：仅 toast 提示，不打断。
    fireEvent.keyDown(editor, { key: "Escape" })
    expect(onStop).not.toHaveBeenCalled()

    // 1s 内再次按 Esc：双击确认，触发停止。
    fireEvent.keyDown(editor, { key: "Escape" })
    expect(onStop).toHaveBeenCalledTimes(1)
  })
})
