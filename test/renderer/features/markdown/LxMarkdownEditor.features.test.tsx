// @vitest-environment jsdom
import { EditorView } from "@codemirror/view"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
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

describe("LxMarkdownEditor 多页面管理与持久化 (useMarkdownPages)", () => {
  it("pageMode 为 true 时根据 localStorage 恢复激活页面，并将内容正确写入编辑器", async () => {
    localStorage.setItem("lx-md-active-page-item-123", "1")

    const pages = [
      { id: "p1", name: "Page 1", content: "# First Page Content" },
      { id: "p2", name: "Page 2", content: "## Second Page Content" },
    ]

    render(<LxMarkdownEditor itemId="item-123" pageMode={true} pages={pages} initialContent="" />)

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    expect(view.state.doc.toString()).toBe("## Second Page Content")
  })

  it("当在编辑器中编辑内容时，触发 onChange 和 onPagesChange 更新当前页", async () => {
    const pages = [{ id: "p1", name: "Page 1", content: "Initial" }]
    const onChange = vi.fn()
    const onPagesChange = vi.fn()

    render(
      <LxMarkdownEditor
        pageMode={true}
        pages={pages}
        initialContent=""
        onChange={onChange}
        onPagesChange={onPagesChange}
      />,
    )

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "Updated Page Content" },
    })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("Updated Page Content")
      expect(onPagesChange).toHaveBeenCalledWith([
        { id: "p1", name: "Page 1", content: "Updated Page Content" },
      ])
    })
  })

  it("Mod+Alt+ArrowLeft / ArrowRight 快捷键实现页面切换与新建", async () => {
    localStorage.setItem("lx-md-active-page-test-item", "0")
    const pages = [
      { id: "p1", name: "Page 1", content: "Page 1 Content" },
      { id: "p2", name: "Page 2", content: "Page 2 Content" },
    ]
    const onPagesChange = vi.fn()

    render(
      <LxMarkdownEditor
        itemId="test-item"
        pageMode={true}
        pages={pages}
        initialContent=""
        onPagesChange={onPagesChange}
      />,
    )

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    expect(view.state.doc.toString()).toBe("Page 1 Content")

    // 按 Mod+Alt+ArrowRight 切换到第二页
    fireEvent.keyDown(document, {
      key: "ArrowRight",
      ctrlKey: true,
      altKey: true,
    })

    await waitFor(() => {
      expect(view.state.doc.toString()).toBe("Page 2 Content")
    })
    expect(localStorage.getItem("lx-md-active-page-test-item")).toBe("1")

    // 再次按 Mod+Alt+ArrowLeft 返回第一页
    fireEvent.keyDown(document, {
      key: "ArrowLeft",
      ctrlKey: true,
      altKey: true,
    })

    await waitFor(() => {
      expect(view.state.doc.toString()).toBe("Page 1 Content")
    })
    expect(localStorage.getItem("lx-md-active-page-test-item")).toBe("0")
  })
})

describe("LxMarkdownEditor 文本格式化快捷键 (markdownFormattingKeymap)", () => {
  it("Mod-b 快捷键对选区内容包裹加粗标记 (**text**)", async () => {
    render(<LxMarkdownEditor initialContent="Hello World" />)

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    // 选中 "World" (from 6 to 11)
    view.dispatch({ selection: { anchor: 6, head: 11 } })

    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "b",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )

    expect(view.state.doc.toString()).toBe("Hello **World**")
  })

  it("Mod-i 快捷键对选区内容包裹斜体标记 (_text_)", async () => {
    render(<LxMarkdownEditor initialContent="Hello World" />)

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    view.dispatch({ selection: { anchor: 6, head: 11 } })

    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "i",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )

    expect(view.state.doc.toString()).toBe("Hello _World_")
  })

  it("Mod-1 快捷键为选区文本添加一级标题 (# )", async () => {
    render(<LxMarkdownEditor initialContent="Title Line" />)

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    // 选中 "Title Line"
    view.dispatch({ selection: { anchor: 0, head: 10 } })

    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "1",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )

    expect(view.state.doc.toString()).toBe("# Title Line")
  })

  it("Mod-Alt-k 快捷键将选区包裹为代码块 (```)", async () => {
    render(<LxMarkdownEditor initialContent="const x = 10" />)

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    view.dispatch({ selection: { anchor: 0, head: 12 } })

    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )

    expect(view.state.doc.toString()).toBe("```\nconst x = 10\n```")
  })

  it("Shift-Tab 在模板块结束行触发状态循环 (todo -> in_progress -> done)", async () => {
    const initialText = "&&& addTemplate\n- 步骤1\n&&& addTemplate --end"
    render(<LxMarkdownEditor initialContent={initialText} />)

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    // 光标移动到模板块结束行末尾
    const endPos = view.state.doc.length
    view.dispatch({ selection: { anchor: endPos } })

    // 触发 Shift-Tab
    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )

    // 应当从未完成变为 in_progress
    expect(view.state.doc.toString()).toContain("&&& addTemplate --end in_progress")

    // 再次触发 Shift-Tab 变为 done
    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )

    expect(view.state.doc.toString()).toContain("&&& addTemplate --end done")
  })

  it("在列表项后按 Enter 自动续行，空列表项按 Enter 退出列表", async () => {
    const initialText = "- [ ] 待办任务一"
    render(<LxMarkdownEditor initialContent={initialText} />)

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    // 光标移动到第一行末尾
    view.dispatch({ selection: { anchor: view.state.doc.length } })

    // 触发 Enter
    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    )

    // 自动续行产生新的未勾选待办项
    expect(view.state.doc.toString()).toBe("- [ ] 待办任务一\n- [ ] ")

    // 再次在空列表项按 Enter
    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    )

    // 空列表项被清空
    expect(view.state.doc.toString()).toBe("- [ ] 待办任务一\n")
  })

  it("在 $$$ 变量块中 Tab 正常缩进，Shift-Tab 切换下一个变量，Ctrl-Tab 切换上一个变量", async () => {
    const initialText = '$$$\nuser: "admin"\npass: "123"\n$$$'
    render(<LxMarkdownEditor initialContent={initialText} />)

    await waitFor(() => expect(getCm()).not.toBeNull())
    const view = EditorView.findFromDOM(getCm()!)!

    // 光标移动到 user 的行首
    const userLineFrom = view.state.doc.line(2).from
    view.dispatch({ selection: { anchor: userLineFrom } })

    // 按 Tab 应该正常缩进（插入 2 空格），而不是跳转选区
    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      }),
    )
    expect(view.state.doc.line(2).text).toBe('  user: "admin"')

    // 按 Shift-Tab 切换到下一个目标（从 key 跳转到 value "admin"）
    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    const selAfterShiftTab1 = view.state.selection.main
    expect(view.state.sliceDoc(selAfterShiftTab1.from, selAfterShiftTab1.to)).toBe("admin")

    // 再次按 Shift-Tab 切换到下一个 key "pass"
    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    const selAfterShiftTab2 = view.state.selection.main
    expect(view.state.sliceDoc(selAfterShiftTab2.from, selAfterShiftTab2.to)).toBe("pass")

    // 按 Ctrl-Tab 切换回上一个目标（跳转回 "admin"）
    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    const selAfterCtrlTab = view.state.selection.main
    expect(view.state.sliceDoc(selAfterCtrlTab.from, selAfterCtrlTab.to)).toBe("admin")
  })
})

describe("LxMarkdownEditor 剪贴板与弹层交互 (useMarkdownPasteReference)", () => {
  it("当未触发弹层时，按 Esc 键正常放行", async () => {
    render(<LxMarkdownEditor initialContent="Some text" />)

    await waitFor(() => expect(getCm()).not.toBeNull())

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })
    getCm()!.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })
})
