// @vitest-environment jsdom
import { EditorView } from "@codemirror/view"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
const renderInput = async () => {
  vi.mocked(promptHistoryApi.get).mockResolvedValue([])
  const onClear = vi.fn()
  const Harness = () => {
    const [text, setText] = useState("")
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
        onClear={onClear}
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
  return { content: content as HTMLElement, onClear }
}

describe("AgentInput 命令面板鼠标点选", () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.mocked(promptHistoryApi.get).mockReset()
  })

  it("点击命令面板项执行命令：容器不取消 pointerdown，mousedown 点选生效", async () => {
    const { content, onClear } = await renderInput()
    const view = EditorView.findFromDOM(content)
    expect(view).not.toBeNull()
    // jsdom 无布局，coordsAtPos 需要手动桩返回坐标，面板才会打开。
    view!.coordsAtPos = vi.fn().mockReturnValue({ left: 10, right: 20, top: 10, bottom: 20 })

    // 输入 /clear 打开命令面板
    act(() => {
      view?.dispatch({ changes: { from: 0, insert: "/clear" }, selection: { anchor: 6 } })
    })

    const option = await screen.findByRole("option", { name: /\/clear/ })

    // 容器若对面板取消 pointerdown，会设置 PREVENT MOUSE EVENT 导致后续 mousedown 不再触发
    expect(fireEvent.pointerDown(option)).toBe(true)

    fireEvent.mouseDown(option)

    await waitFor(() => {
      expect(onClear).toHaveBeenCalledTimes(1)
    })
    expect(view?.state.doc.toString()).toBe("")
  })
})
