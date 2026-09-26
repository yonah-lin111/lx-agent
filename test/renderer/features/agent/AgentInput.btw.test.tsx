// @vitest-environment jsdom

import { EditorView } from "@codemirror/view"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { LxAgentTopToast, LxToastProvider } from "@/components/ui/LxToast"
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

// 受控输入 harness：返回编辑器节点、发送回调与 btw 发送回调。
const renderInput = async (options: {
  initialText?: string
  canUseBtw?: boolean
}): Promise<{
  content: HTMLElement
  onSend: ReturnType<typeof vi.fn>
  onBtwSend: ReturnType<typeof vi.fn>
}> => {
  vi.mocked(promptHistoryApi.get).mockResolvedValue([])
  const onSend = vi.fn()
  const onBtwSend = vi.fn()
  const Harness = (): React.JSX.Element => {
    const [text, setText] = useState(options.initialText ?? "")
    return (
      <LxToastProvider>
        <LxAgentTopToast />
        <AgentInput
          inputText={text}
          isStreaming={false}
          isCompacting={false}
          queuedCount={0}
          queuedMessages={[]}
          onInputChange={setText}
          onSend={onSend}
          onBtwSend={onBtwSend}
          canUseBtw={options.canUseBtw ?? true}
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
      </LxToastProvider>
    )
  }
  render(<Harness />)
  await act(async () => {})
  const content = document.querySelector(".cm-content") as HTMLElement | null
  expect(content).not.toBeNull()
  return { content: content as HTMLElement, onSend, onBtwSend }
}

// 打开编辑器命令面板所需的光标坐标桩。
const stubCoords = (content: HTMLElement): EditorView => {
  const view = EditorView.findFromDOM(content)
  expect(view).not.toBeNull()
  view!.coordsAtPos = vi.fn().mockReturnValue({ left: 10, right: 20, top: 10, bottom: 20 })
  return view!
}

describe("AgentInput /btw 命令", () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.mocked(promptHistoryApi.get).mockReset()
  })

  it("命令面板选中 /btw 回显 /btw -prompt", async () => {
    const { content } = await renderInput({})
    const view = stubCoords(content)

    act(() => {
      view.dispatch({ changes: { from: 0, insert: "/btw" }, selection: { anchor: 4 } })
    })

    const option = await screen.findByRole("option", { name: /\/btw/ })
    fireEvent.mouseDown(option)

    await waitFor(() => {
      expect(view.state.doc.toString()).toBe("/btw -prompt")
    })
  })

  it("发送 /btw 问题路由到 onBtwSend，不进入主会话发送", async () => {
    const { content, onSend, onBtwSend } = await renderInput({
      initialText: "/btw 这个报错在哪？",
    })

    fireEvent.keyDown(content, { key: "Enter" })

    await waitFor(() => {
      expect(onBtwSend).toHaveBeenCalledWith("这个报错在哪？")
    })
    expect(onSend).not.toHaveBeenCalled()
  })

  it("无 QA 的主会话拦截 /btw 发送并提示", async () => {
    const { content, onBtwSend } = await renderInput({
      initialText: "/btw 这个报错在哪？",
      canUseBtw: false,
    })

    fireEvent.keyDown(content, { key: "Enter" })

    expect(await screen.findByText("Start the conversation before using /btw")).toBeDefined()
    expect(onBtwSend).not.toHaveBeenCalled()
  })

  it("无 QA 时命令面板不展示 /btw", async () => {
    const { content } = await renderInput({ canUseBtw: false })
    const view = stubCoords(content)

    act(() => {
      view.dispatch({ changes: { from: 0, insert: "/" }, selection: { anchor: 1 } })
    })

    // 其他内置命令正常出现，/btw 被过滤。
    expect(await screen.findByRole("option", { name: /\/clear/ })).toBeDefined()
    expect(screen.queryByRole("option", { name: /\/btw/ })).toBeNull()
  })
})
