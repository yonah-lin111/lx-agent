// @vitest-environment jsdom

// 集成验证：UI 版编辑器行首输入 #、- 等触发标记时弹出块命令面板，支持键盘选择替换。

import { EditorView } from "@codemirror/view"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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

const getCm = (): HTMLElement => {
  const element = document.querySelector(".cm-content")
  if (!element) throw new Error("editor not mounted")
  return element as HTMLElement
}

const getView = (): EditorView => {
  const element = document.querySelector(".cm-editor")
  if (!element) throw new Error("editor not mounted")
  const view = EditorView.findFromDOM(element as HTMLElement)
  if (!view) throw new Error("editor view not found")
  return view
}

/**
 * 挂载编辑器并输入触发标记，等待块命令面板渲染。
 */
const mountAndTypeTrigger = async (marker: string): Promise<EditorView> => {
  render(<LxMarkdownEditor initialContent="" />)
  await waitFor(() => expect(document.querySelector(".cm-editor")).not.toBeNull())

  const view = getView()
  act(() => {
    view.dispatch({
      changes: { from: 0, insert: marker },
      selection: { anchor: marker.length },
    })
  })
  await waitFor(() =>
    expect(document.querySelector(".markdown-command-menu--block")).not.toBeNull(),
  )
  return view
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("LxMarkdownEditor 块命令面板", () => {
  it("输入 - 弹出无序列表与任务列表命令", async () => {
    await mountAndTypeTrigger("-")

    expect(screen.getByText("Bullet List")).not.toBeNull()
    expect(screen.getByText("Task List")).not.toBeNull()
  })

  it("输入 # 弹出 6 级标题命令", async () => {
    await mountAndTypeTrigger("#")

    expect(screen.getAllByRole("option")).toHaveLength(6)
    expect(screen.getByText("Heading 1")).not.toBeNull()
    expect(screen.getByText("Heading 6")).not.toBeNull()
  })

  it("方向键切换后回车替换触发标记并选中占位文本", async () => {
    const view = await mountAndTypeTrigger("-")

    fireEvent.keyDown(getCm(), { key: "ArrowDown" })
    fireEvent.keyDown(getCm(), { key: "Enter" })

    await waitFor(() => expect(view.state.doc.toString()).toBe("- [ ] task"))
    expect(view.state.selection.main.from).toBe(6)
    expect(view.state.selection.main.to).toBe(10)
  })

  it("Esc 关闭面板且保留触发文本", async () => {
    const view = await mountAndTypeTrigger("-")

    fireEvent.keyDown(getCm(), { key: "Escape" })

    await waitFor(() => expect(document.querySelector(".markdown-command-menu--block")).toBeNull())
    expect(view.state.doc.toString()).toBe("-")
  })

  it("代码围栏闭合行不弹出代码块命令", async () => {
    render(<LxMarkdownEditor initialContent={"```\nphp\n```"} />)
    await waitFor(() => expect(document.querySelector(".cm-editor")).not.toBeNull())

    const view = getView()
    act(() => {
      view.dispatch({ selection: { anchor: view.state.doc.length } })
    })

    expect(document.querySelector(".markdown-command-menu--block")).toBeNull()
  })
})
