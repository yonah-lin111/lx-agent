// @vitest-environment jsdom

import { EditorView } from "@codemirror/view"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { promptHistoryApi } from "@/features/agent/api/promptHistoryApi"
import { AgentBtwPanel } from "@/features/agent/components/panels"
import { btwStore } from "@/features/agent/hooks/btwStore"

vi.mock("@/features/agent/api/promptHistoryApi", () => ({
  promptHistoryApi: { get: vi.fn(), add: vi.fn() },
}))

// Mock Git 组件避免依赖 gitApi 与 Electron IPC。
vi.mock("@/features/git", () => ({
  GitStatusBar: () => <div data-testid="mock-git-status-bar" />,
  GitWorktreeCommandMenu: () => null,
}))

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

const OWNER = "btw-panel-sess"

// 构造两条侧问线：锚点 1000（Q1/A1）与 2000（Q2/A2）。
const seedThreads = (): void => {
  const first = btwStore.appendUser(OWNER, 1000, "first question")
  btwStore.appendAssistant(OWNER, first.threadId, "first answer")
  const second = btwStore.appendUser(OWNER, 2000, "second question")
  btwStore.appendAssistant(OWNER, second.threadId, "second answer")
}

const renderPanel = async (options: { isOpen?: boolean; isPending?: boolean } = {}) => {
  vi.mocked(promptHistoryApi.get).mockResolvedValue([])
  const onAsk = vi.fn()
  const onClose = vi.fn()
  render(
    <AgentBtwPanel
      isOpen={options.isOpen ?? true}
      onClose={onClose}
      ownerKey={OWNER}
      isPending={options.isPending ?? false}
      onAsk={onAsk}
      selectedModel="m"
      modelOptions={[{ label: "M", options: [{ label: "m", value: "m" }] }]}
      hasModelOptions
      collaborationMode="build"
      projectPath="/proj"
    />,
  )
  await act(async () => {})
  return { onAsk, onClose }
}

describe("AgentBtwPanel", () => {
  afterEach(cleanup)

  beforeEach(() => {
    localStorage.clear()
    // 清理模块级 store 中上一个用例遗留的侧问线。
    btwStore.deleteOwner(OWNER)
    vi.mocked(promptHistoryApi.get).mockReset()
    vi.mocked(promptHistoryApi.add).mockReset()
    vi.mocked(promptHistoryApi.add).mockResolvedValue([])
  })

  it("默认展示最新侧问线：问题气泡与回答 Markdown", async () => {
    seedThreads()
    await renderPanel()

    expect(screen.getByText(/2 \/ 2/)).toBeDefined()
    expect(screen.getByText("second question")).toBeDefined()
    expect(screen.getByText("second answer")).toBeDefined()
    expect(screen.queryByText("first question")).toBeNull()
  })

  it("左右箭头切换侧问线并在两端禁用", async () => {
    seedThreads()
    await renderPanel()

    const prev = screen.getByLabelText("Previous side question") as HTMLButtonElement
    const next = screen.getByLabelText("Next side question") as HTMLButtonElement
    expect(prev.disabled).toBe(false)
    expect(next.disabled).toBe(true)

    fireEvent.click(prev)
    await waitFor(() => {
      expect(screen.getByText(/1 \/ 2/)).toBeDefined()
    })
    expect(screen.getByText("first question")).toBeDefined()
    expect(screen.queryByText("second question")).toBeNull()
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(false)

    fireEvent.click(next)
    await waitFor(() => {
      expect(screen.getByText(/2 \/ 2/)).toBeDefined()
    })
  })

  it("面板输入发送侧问并清空输入", async () => {
    seedThreads()
    const { onAsk } = await renderPanel()

    const content = document.querySelector(".cm-content") as HTMLElement | null
    expect(content).not.toBeNull()
    const view = EditorView.findFromDOM(content as HTMLElement)!
    act(() => {
      view.dispatch({ changes: { from: 0, insert: "追问内容" }, selection: { anchor: 4 } })
    })
    await act(async () => {})

    fireEvent.keyDown(content as HTMLElement, { key: "Enter" })
    await waitFor(() => {
      expect(onAsk).toHaveBeenCalledWith("追问内容")
    })
    expect(view.state.doc.toString()).toBe("")
  })

  it("请求在途时显示 spinner 并禁用发送按钮", async () => {
    seedThreads()
    await renderPanel({ isPending: true })

    expect(screen.getByText("Answering...")).toBeDefined()
    const sendButton = screen.getByLabelText("Answering...") as HTMLButtonElement
    expect(sendButton.disabled).toBe(true)
  })

  it("关闭按钮触发 onClose", async () => {
    seedThreads()
    const { onClose } = await renderPanel()

    fireEvent.click(screen.getByLabelText("Close btw panel"))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("无侧问记录时展示空态", async () => {
    await renderPanel()

    expect(screen.getByText("No btw side questions yet")).toBeDefined()
  })
})
