// @vitest-environment jsdom
import { EditorView } from "@codemirror/view"
import { cleanup, render, waitFor } from "@testing-library/react"
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
const worktrees = [
  { path: "/repo", branch: "dev", isDefault: true },
  { path: "/repo/.worktrees/feature-x", branch: "git-worktree-switch", isDefault: false },
]
const getCm = (): HTMLElement | null => document.querySelector(".cm-content")

beforeEach(() => {
  cleanup()
  vi.restoreAllMocks()
  ;(window as unknown as { api: unknown }).api = {
    git: {
      getStatus: vi
        .fn()
        .mockResolvedValue({ branch: "dev", changes: { staged: 0, unstaged: 0, untracked: 0 } }),
      listWorktrees: vi.fn().mockResolvedValue(worktrees),
    },
    markdown: { generateTemplateTitle: vi.fn().mockResolvedValue(null) },
    getPathForFile: vi.fn().mockReturnValue("/path"),
  }
})
afterEach(() => cleanup())

describe("LxMarkdownEditor /gitWorktree 回车切换", () => {
  it("模板块外：回车触发全局 onWorktreePathChange 并清除命令行", async () => {
    const onWorktreePathChange = vi.fn().mockResolvedValue(true)
    render(
      <LxMarkdownEditor
        initialContent=""
        projectPath="/repo"
        onWorktreePathChange={onWorktreePathChange}
      />,
    )
    await waitFor(() => expect(getCm()).not.toBeNull())
    await new Promise((r) => setTimeout(r, 200))

    const view = EditorView.findFromDOM(getCm()!)!
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "/gitWorktree git-worktree-switch" },
      selection: { anchor: "/gitWorktree git-worktree-switch".length },
    })
    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    )
    await new Promise((r) => setTimeout(r, 120))

    expect(onWorktreePathChange).toHaveBeenCalledWith("/repo/.worktrees/feature-x")
    expect(view.state.doc.toString()).toBe("")
  })

  it("模板块外：切换默认工作区（dev）时传 null 解除绑定", async () => {
    const onWorktreePathChange = vi.fn().mockResolvedValue(true)
    render(
      <LxMarkdownEditor
        initialContent=""
        projectPath="/repo"
        onWorktreePathChange={onWorktreePathChange}
      />,
    )
    await waitFor(() => expect(getCm()).not.toBeNull())
    await new Promise((r) => setTimeout(r, 200))

    const view = EditorView.findFromDOM(getCm()!)!
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "/gitWorktree dev" },
      selection: { anchor: "/gitWorktree dev".length },
    })
    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    )
    await new Promise((r) => setTimeout(r, 120))

    expect(onWorktreePathChange).toHaveBeenCalledWith(null)
    expect(view.state.doc.toString()).toBe("")
  })

  it("模板块内：回车把 {wt:} 写入当前块结束行并清除命令行", async () => {
    const onWorktreePathChange = vi.fn().mockResolvedValue(true)
    render(
      <LxMarkdownEditor
        initialContent=""
        projectPath="/repo"
        onWorktreePathChange={onWorktreePathChange}
      />,
    )
    await waitFor(() => expect(getCm()).not.toBeNull())
    await new Promise((r) => setTimeout(r, 200))

    const doc = [
      "&&& addTemplate 「title: 测试」",
      "- 位置: ",
      "/gitWorktree git-worktree-switch",
      "&&& done",
    ].join("\n")
    const view = EditorView.findFromDOM(getCm()!)!
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: doc },
      selection: { anchor: doc.length },
    })
    // 光标移到命令行使。
    view.dispatch({
      selection: {
        anchor: doc.indexOf("/gitWorktree") + "/gitWorktree git-worktree-switch".length,
      },
    })
    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    )
    await new Promise((r) => setTimeout(r, 120))

    const result = view.state.doc.toString()
    expect(result).toContain("&&& done {wt:git-worktree-switch}")
    expect(result).not.toContain("/gitWorktree")
    expect(onWorktreePathChange).not.toHaveBeenCalled()
  })
})
