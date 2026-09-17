// @vitest-environment jsdom

// 回归：设置页 Markdown 编辑器必须跟随外部内容变更（保存重载/重置/刷新）更新正文，
// 同时不能把自身输入回响当成外部变更（避免光标跳变与内容重复）。

import { EditorView } from "@codemirror/view"
import { cleanup, render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LxMarkdownEditor } from "@/components/ui/LxMarkdown/LxMarkdownEditor"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
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

const getView = (): EditorView => {
  const element = document.querySelector(".cm-editor")
  if (!element) throw new Error("editor not mounted")
  const view = EditorView.findFromDOM(element as HTMLElement)
  if (!view) throw new Error("editor view not found")
  return view
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("LxMarkdownEditor 外部内容同步", () => {
  it("initialContent 外部变更时同步文档（含清空后再填充）", async () => {
    const { rerender } = render(<LxMarkdownEditor initialContent="first" />)

    await waitFor(() => {
      expect(getView().state.doc.toString()).toBe("first")
    })

    // 外部清空（保存后缓存清空）
    rerender(<LxMarkdownEditor initialContent="" />)
    await waitFor(() => {
      expect(getView().state.doc.toString()).toBe("")
    })

    // 外部填充（重新读盘完成）
    rerender(<LxMarkdownEditor initialContent="reloaded" />)
    await waitFor(() => {
      expect(getView().state.doc.toString()).toBe("reloaded")
    })
  })

  it("自身输入回响不触发替换，内容不重复", async () => {
    const onChange = vi.fn()
    const { rerender } = render(<LxMarkdownEditor initialContent="base" onChange={onChange} />)

    await waitFor(() => {
      expect(getView().state.doc.toString()).toBe("base")
    })

    const view = getView()
    view.dispatch({
      changes: { from: view.state.doc.length, to: view.state.doc.length, insert: "!" },
    })
    expect(onChange).toHaveBeenLastCalledWith("base!")

    // 父组件用回传内容重渲染：文档应保持不变
    rerender(<LxMarkdownEditor initialContent="base!" onChange={onChange} />)
    await waitFor(() => {
      expect(getView().state.doc.toString()).toBe("base!")
    })
  })
})
