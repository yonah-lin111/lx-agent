// @vitest-environment jsdom

import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import type { ProjectFileEntry } from "@shared/project"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useMarkdownPanels } from "@/features/markdown/hooks/useMarkdownPanels"

const createEditorView = (doc: string, cursor: number): EditorView => {
  const editorView = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: cursor } }),
  })
  editorView.coordsAtPos = vi.fn().mockReturnValue({ left: 10, right: 20, top: 10, bottom: 20 })
  return editorView
}

const createFileSearch = (files: ProjectFileEntry[]) => vi.fn().mockResolvedValue(files)

describe("useMarkdownPanels 块命令面板行为", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("行首触发标记弹出面板，键盘切换后选中替换触发标记", () => {
    const doc = "-"
    const editorView = createEditorView(doc, doc.length)
    const editorRef = { current: editorView }
    const { result } = renderHook(() => useMarkdownPanels({ editorViewRef: editorRef }))

    act(() => {
      result.current.syncBlockCommandPanel(editorView)
    })
    expect(result.current.blockCommandPanel?.trigger.kind).toBe("unorderedList")
    expect(result.current.activeBlockCommandIndex).toBe(0)
    expect(result.current.blockCommandPanel?.commands.map((command) => command.id)).toEqual([
      "unorderedList",
      "taskList",
    ])

    act(() => {
      result.current.handleBlockCommandKey(1)
    })
    expect(result.current.activeBlockCommandIndex).toBe(1)

    const selected = result.current.blockCommandPanel?.commands[1]
    act(() => {
      result.current.selectBlockCommand(selected!)
    })
    expect(editorView.state.doc.toString()).toBe("- [ ] task")
  })

  it("上一行已是同类列表项时抑制连续列表的块命令面板", () => {
    const doc = "- first\n-"
    const editorView = createEditorView(doc, doc.length)
    const editorRef = { current: editorView }
    const { result } = renderHook(() => useMarkdownPanels({ editorViewRef: editorRef }))

    act(() => {
      result.current.syncBlockCommandPanel(editorView)
    })
    expect(result.current.blockCommandPanel).toBeNull()
  })

  it("代码围栏闭合行不弹出代码块命令面板", () => {
    const doc = "```\nphp\n```"
    const editorView = createEditorView(doc, doc.length)
    const editorRef = { current: editorView }
    const { result } = renderHook(() => useMarkdownPanels({ editorViewRef: editorRef }))

    act(() => {
      result.current.syncBlockCommandPanel(editorView)
    })
    expect(result.current.blockCommandPanel).toBeNull()
  })

  it("已存在闭合围栏时按原围栏长度补全语言标记", () => {
    const doc = "```\nphp\n```"
    const editorView = createEditorView(doc, 3)
    const editorRef = { current: editorView }
    const { result } = renderHook(() => useMarkdownPanels({ editorViewRef: editorRef }))

    act(() => {
      result.current.syncBlockCommandPanel(editorView)
    })
    const codeBlockCommand = result.current.blockCommandPanel?.commands.find(
      (command) => command.id === "codeBlock",
    )
    expect(codeBlockCommand).toBeDefined()

    act(() => {
      result.current.selectBlockCommand(codeBlockCommand!)
    })
    expect(editorView.state.doc.toString()).toBe("```language\nphp\n```")
    expect(editorView.state.selection.main.from).toBe(3)
    expect(editorView.state.selection.main.to).toBe(11)
  })
})

describe("useMarkdownPanels 文件提及面板行为", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("@ 触发异步搜索，选中后插入引用路径", async () => {
    const doc = "@"
    const editorView = createEditorView(doc, doc.length)
    const editorRef = { current: editorView }
    const onSearchFiles = createFileSearch([
      { path: "src/a.ts", isDirectory: false },
      { path: "src/dir", isDirectory: true },
    ])
    const { result } = renderHook(() =>
      useMarkdownPanels({
        editorViewRef: editorRef,
        projectId: "project-1",
        projectPath: "/proj",
        onSearchFiles,
      }),
    )

    await act(async () => {
      result.current.syncFileMentionPanel(editorView)
    })

    expect(onSearchFiles).toHaveBeenCalledWith("project-1", "")
    expect(result.current.fileMentionPanel?.files.map((file) => file.mentionPath)).toEqual([
      "src/a.ts",
      "src/dir",
    ])
    expect(result.current.fileMentionPanel?.files[0].worktreeName).toBe("proj")

    act(() => {
      result.current.handleFileMentionKey("ArrowDown")
    })
    expect(result.current.activeFileMentionIndex).toBe(1)

    const selected = result.current.fileMentionPanel?.files[1]
    act(() => {
      result.current.selectFileMention(selected!)
    })
    expect(editorView.state.doc.toString()).toBe("@src/dir ")
    expect(result.current.fileMentionPanel).toBeNull()
  })

  it("未提供搜索能力时不弹出文件提及面板", () => {
    const doc = "@"
    const editorView = createEditorView(doc, doc.length)
    const editorRef = { current: editorView }
    const { result } = renderHook(() => useMarkdownPanels({ editorViewRef: editorRef }))

    act(() => {
      result.current.syncFileMentionPanel(editorView)
    })
    expect(result.current.fileMentionPanel).toBeNull()
  })

  it("面板关闭后到达的过期搜索结果被丢弃", async () => {
    const doc = "@"
    const editorView = createEditorView(doc, doc.length)
    const editorRef = { current: editorView }
    let resolveSearch: (files: ProjectFileEntry[]) => void = () => {}
    const onSearchFiles = vi.fn().mockImplementation(
      () =>
        new Promise<ProjectFileEntry[]>((resolve) => {
          resolveSearch = resolve
        }),
    )
    const { result } = renderHook(() =>
      useMarkdownPanels({
        editorViewRef: editorRef,
        projectId: "project-1",
        projectPath: "/proj",
        onSearchFiles,
      }),
    )

    await act(async () => {
      result.current.syncFileMentionPanel(editorView)
    })
    act(() => {
      result.current.closeFileMentionPanel()
    })

    await act(async () => {
      resolveSearch([{ path: "src/a.ts", isDirectory: false }])
    })
    expect(result.current.fileMentionPanel).toBeNull()
  })
})
