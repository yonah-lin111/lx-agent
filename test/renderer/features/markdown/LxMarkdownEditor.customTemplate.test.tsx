// @vitest-environment jsdom

import { EditorView } from "@codemirror/view"
import type { MarkdownTemplateCommandItem } from "@shared/contracts/markdown"
import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LxMarkdownEditor } from "@/features/markdown/LxMarkdownEditor"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const getCm = (): HTMLElement | null => document.querySelector(".cm-content")

// jsdom 未实现 Range 几何 API；CodeMirror 6 测量依赖（与 features/undoRedo 测试一致）。
const rangeRect = {
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
Range.prototype.getClientRects = () => [rangeRect] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => rangeRect

const CUSTOM_TEMPLATE_CONTENT = [
  "&&& reviewTemplate",
  "## 检查项",
  "+++ supple --start",
  "补充说明",
  "+++ supple --end",
  "+++ log --start",
  "执行记录",
  "+++ log --end",
  "&&& reviewTemplate --end",
].join("\n")

const customCommand: MarkdownTemplateCommandItem = {
  name: "reviewTemplate",
  description: "Review template",
  content: CUSTOM_TEMPLATE_CONTENT,
  scope: "global",
  source: "user",
  filePath: "/tmp/reviewTemplate.md",
}

const listMarkdownCommands = vi.fn<() => Promise<MarkdownTemplateCommandItem[]>>()

beforeEach(() => {
  cleanup()
  vi.restoreAllMocks()
  listMarkdownCommands.mockResolvedValue([customCommand])
  ;(window as unknown as { api: unknown }).api = {
    git: {
      getStatus: vi
        .fn()
        .mockResolvedValue({ branch: "dev", changes: { staged: 0, unstaged: 0, untracked: 0 } }),
      listWorktrees: vi.fn().mockResolvedValue([]),
      listBranches: vi.fn().mockResolvedValue([]),
    },
    agent: { getDefaultPath: vi.fn().mockResolvedValue("") },
    project: {
      items: { list: vi.fn().mockResolvedValue([]) },
      projects: { list: vi.fn().mockResolvedValue([]) },
      folders: { list: vi.fn().mockResolvedValue([]) },
    },
    markdown: {
      generateTemplateTitle: vi.fn().mockResolvedValue(null),
      listMarkdownCommands,
    },
    getPathForFile: vi.fn().mockReturnValue("/repo/test.md"),
  }
})

afterEach(() => cleanup())

describe("LxMarkdownEditor 自定义模板命令插入", () => {
  it("补全 &&& 与 +++ supple 结束行 id，+++ log 结束行保持原样", async () => {
    render(<LxMarkdownEditor initialContent="" projectPath="/repo" />)
    await waitFor(() => expect(getCm()).not.toBeNull())
    await waitFor(() => expect(listMarkdownCommands).toHaveBeenCalled())
    // 等待自定义命令加载完成并同步到面板上下文 ref。
    await new Promise((resolve) => setTimeout(resolve, 200))

    const view = EditorView.findFromDOM(getCm()!)!
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "/reviewTemplate" },
      selection: { anchor: "/reviewTemplate".length },
    })
    await waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())

    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    )

    await waitFor(() => {
      expect(view.state.doc.toString()).toMatch(/&&& reviewTemplate --end \{id:[0-9a-f]{32}\}/)
    })

    const doc = view.state.doc.toString()
    expect(doc).toMatch(/^\+\+\+ supple --end \{id:[0-9a-f]{32}\}$/m)
    expect(doc).toContain("+++ log --end\n&&& reviewTemplate --end {id:")
    expect(doc.match(/\{id:[0-9a-f]{32}\}/g)).toHaveLength(2)
    // 开始行与正文保持原样，未被注入 id。
    expect(doc).toContain("&&& reviewTemplate\n## 检查项")
  })
})
