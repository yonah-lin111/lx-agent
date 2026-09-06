// @vitest-environment jsdom
import { isolateHistory, redo, undo, undoDepth } from "@codemirror/commands"
import { EditorView } from "@codemirror/view"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LxMarkdownEditor } from "@/features/markdown/LxMarkdownEditor"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = () => undefined
    unobserve = () => undefined
    disconnect = () => undefined
  },
)

const rect = {
  left: 10,
  right: 10,
  top: 5,
  bottom: 25,
  width: 0,
  height: 20,
  x: 10,
  y: 5,
  toJSON: () => ({}),
} as DOMRect
Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => rect

const getCm = (): HTMLElement | null => document.querySelector(".cm-content")

beforeEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  ;(window as unknown as { api: unknown }).api = {
    git: {
      getStatus: vi
        .fn()
        .mockResolvedValue({ branch: "dev", changes: { staged: 0, unstaged: 0, untracked: 0 } }),
      listWorktrees: vi.fn().mockResolvedValue([]),
    },
    markdown: {
      generateTemplateTitle: vi.fn().mockResolvedValue(null),
      listMarkdownCommands: vi.fn().mockResolvedValue([]),
    },
    getPathForFile: vi.fn().mockReturnValue("/repo/test.md"),
  }
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe("LxMarkdownEditor 撤回与重做核心功能 (Undo / Redo)", () => {
  it("单次编辑后支持通过 undo 撤回并在其后通过 redo 重做", async () => {
    render(<LxMarkdownEditor initialContent="Base content" />)

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    // 编辑内容：在末尾追加文本
    view.dispatch({
      changes: { from: 12, to: 12, insert: " -> step 1" },
    })
    expect(view.state.doc.toString()).toBe("Base content -> step 1")
    expect(undoDepth(view.state)).toBeGreaterThan(0)

    // 执行撤回
    const undoSuccess = undo(view)
    expect(undoSuccess).toBe(true)
    expect(view.state.doc.toString()).toBe("Base content")

    // 执行重做
    const redoSuccess = redo(view)
    expect(redoSuccess).toBe(true)
    expect(view.state.doc.toString()).toBe("Base content -> step 1")
  })

  it("多次连续编辑时支持逐步撤回与逐步重做", async () => {
    render(<LxMarkdownEditor initialContent="Start" />)

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    // 第一步修改
    view.dispatch({
      changes: { from: view.state.doc.length, to: view.state.doc.length, insert: " A" },
    })
    // 第二步修改（使用 isolateHistory.of("before") 显式划分为独立的撤销节点）
    view.dispatch({
      changes: { from: view.state.doc.length, to: view.state.doc.length, insert: " B" },
      annotations: [isolateHistory.of("before")],
    })

    expect(view.state.doc.toString()).toBe("Start A B")

    // 第一次撤回回退 B
    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe("Start A")

    // 第二次撤回回退 A
    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe("Start")

    // 无法继续撤回
    expect(undo(view)).toBe(false)
    expect(view.state.doc.toString()).toBe("Start")

    // 第一次重做恢复 A
    expect(redo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe("Start A")

    // 第二次重做恢复 B
    expect(redo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe("Start A B")

    // 无法继续重做
    expect(redo(view)).toBe(false)
  })
})

describe("LxMarkdownEditor 键盘快捷键触发撤回与重做", () => {
  it("按下 Mod-z 快捷键触发撤回", async () => {
    render(<LxMarkdownEditor initialContent="Shortcut Doc" />)

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    view.dispatch({
      changes: { from: view.state.doc.length, to: view.state.doc.length, insert: " Edit" },
    })
    expect(view.state.doc.toString()).toBe("Shortcut Doc Edit")

    // 触发 Mod-z (在 jsdom 环境中 Mod 映射为 ctrlKey)
    fireEvent.keyDown(getCm()!, {
      key: "z",
      ctrlKey: true,
    })
    expect(view.state.doc.toString()).toBe("Shortcut Doc")
  })

  it("按下 Mod-Shift-z 快捷键触发重做", async () => {
    render(<LxMarkdownEditor initialContent="Shortcut Doc" />)

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    view.dispatch({
      changes: { from: view.state.doc.length, to: view.state.doc.length, insert: " Edit" },
    })
    undo(view)
    expect(view.state.doc.toString()).toBe("Shortcut Doc")

    // 触发 Mod-Shift-z
    fireEvent.keyDown(getCm()!, {
      key: "z",
      ctrlKey: true,
      shiftKey: true,
    })
    expect(view.state.doc.toString()).toBe("Shortcut Doc Edit")
  })

  it("按下 Ctrl-Y 快捷键触发重做", async () => {
    render(<LxMarkdownEditor initialContent="Shortcut Doc" />)

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    view.dispatch({
      changes: { from: view.state.doc.length, to: view.state.doc.length, insert: " RedoByCtrlY" },
    })
    undo(view)
    expect(view.state.doc.toString()).toBe("Shortcut Doc")

    // 触发 Ctrl-y (Mod-y)
    fireEvent.keyDown(getCm()!, {
      key: "y",
      ctrlKey: true,
    })
    expect(view.state.doc.toString()).toBe("Shortcut Doc RedoByCtrlY")
  })
})

describe("LxMarkdownEditor 多页面模式撤销栈隔离", () => {
  it("页面切换后隔离撤销历史，防止误撤销其他页面的修改导致内容错乱", async () => {
    localStorage.setItem("lx-md-active-page-isolation-test", "0")
    const initialPages = [
      { id: "page-1", name: "Page 1", content: "# Page 1 original" },
      { id: "page-2", name: "Page 2", content: "# Page 2 original" },
    ]

    const TestHost = (): React.JSX.Element => {
      const [pages, setPages] = useState(initialPages)
      return (
        <div>
          <div data-testid="page0-content">{pages[0]?.content}</div>
          <div data-testid="page1-content">{pages[1]?.content}</div>
          <LxMarkdownEditor
            itemId="isolation-test"
            pageMode={true}
            pages={pages}
            onPagesChange={(next) => setPages(next)}
            initialContent=""
          />
        </div>
      )
    }

    render(<TestHost />)

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    // 初始处于 Page 1
    expect(view.state.doc.toString()).toBe("# Page 1 original")

    // 在 Page 1 上修改内容
    view.dispatch({
      changes: { from: view.state.doc.length, to: view.state.doc.length, insert: " (modified)" },
    })
    expect(view.state.doc.toString()).toBe("# Page 1 original (modified)")
    expect(undoDepth(view.state)).toBeGreaterThan(0)
    await waitFor(() =>
      expect(screen.getByTestId("page0-content").textContent).toBe("# Page 1 original (modified)"),
    )

    // 按 Mod+Alt+ArrowRight 切换到 Page 2
    fireEvent.keyDown(document, {
      key: "ArrowRight",
      ctrlKey: true,
      altKey: true,
    })

    await waitFor(() => expect(view.state.doc.toString()).toBe("# Page 2 original"))

    // Page 2 激活后，撤销深度应当重置为 0
    expect(undoDepth(view.state)).toBe(0)

    // 在 Page 2 上按撤回不应执行任何操作，更不能逆向应用 Page 1 的变更
    const page2UndoResult = undo(view)
    expect(page2UndoResult).toBe(false)
    expect(view.state.doc.toString()).toBe("# Page 2 original")

    // 在 Page 2 上修改内容
    view.dispatch({
      changes: { from: view.state.doc.length, to: view.state.doc.length, insert: " (page 2 edit)" },
    })
    expect(view.state.doc.toString()).toBe("# Page 2 original (page 2 edit)")
    expect(undoDepth(view.state)).toBeGreaterThan(0)
    await waitFor(() =>
      expect(screen.getByTestId("page1-content").textContent).toBe(
        "# Page 2 original (page 2 edit)",
      ),
    )

    // 执行撤回只影响 Page 2 本地内容
    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe("# Page 2 original")
    await waitFor(() =>
      expect(screen.getByTestId("page1-content").textContent).toBe("# Page 2 original"),
    )

    // 切回 Page 1
    fireEvent.keyDown(document, {
      key: "ArrowLeft",
      ctrlKey: true,
      altKey: true,
    })

    await waitFor(() => expect(view.state.doc.toString()).toBe("# Page 1 original (modified)"))
    // 切回 Page 1 后历史栈同样隔离重置
    expect(undoDepth(view.state)).toBe(0)
    expect(undo(view)).toBe(false)
  })
})

describe("LxMarkdownEditor 工具栏撤回/重做按钮联动", () => {
  it("工具栏 Undo/Redo 按钮根据历史深度联动禁用状态，并能响应点击事件", async () => {
    render(<LxMarkdownEditor initialContent="Toolbar test doc" />)

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    const undoButton = screen.getByLabelText("Undo") as HTMLButtonElement
    const redoButton = screen.getByLabelText("Redo") as HTMLButtonElement

    // 初始无历史：Undo 与 Redo 均被禁用
    expect(undoButton.disabled).toBe(true)
    expect(redoButton.disabled).toBe(true)

    // 录入内容触发 updateListener
    view.dispatch({
      changes: { from: view.state.doc.length, to: view.state.doc.length, insert: " text" },
    })

    // Undo 按钮转为可用，Redo 仍禁用
    await waitFor(() => expect(undoButton.disabled).toBe(false))
    expect(redoButton.disabled).toBe(true)

    // 点击 Undo 按钮
    fireEvent.click(undoButton)
    expect(view.state.doc.toString()).toBe("Toolbar test doc")

    // 撤回后 Redo 转为可用，Undo 转为禁用
    await waitFor(() => expect(redoButton.disabled).toBe(false))
    expect(undoButton.disabled).toBe(true)

    // 点击 Redo 按钮
    fireEvent.click(redoButton)
    expect(view.state.doc.toString()).toBe("Toolbar test doc text")

    // 重做完成后 Undo 恢复可用，Redo 转为禁用
    await waitFor(() => expect(undoButton.disabled).toBe(false))
    expect(redoButton.disabled).toBe(true)
  })
})
