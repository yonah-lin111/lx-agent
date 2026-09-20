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

describe("useMarkdownPanels 字母快捷输入面板行为", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("正文裸字母命中页面变量时弹出面板，选中后插入变量值", () => {
    const doc = [
      "$$$ varTemplate --start 「title: 」",
      "@content:",
      "  - @src/foo.ts",
      'repo: "lx-agent"',
      "$$$ varTemplate --end",
      "",
      "re",
    ].join("\n")
    const editorView = createEditorView(doc, doc.length)
    const editorRef = { current: editorView }
    const { result } = renderHook(() => useMarkdownPanels({ editorViewRef: editorRef }))

    act(() => {
      result.current.syncTemplateFilePanel(editorView)
    })
    expect(result.current.templateFilePanel?.variables.map((item) => item.name)).toEqual(["repo"])
    expect(result.current.templateFilePanel?.files).toEqual([])

    act(() => {
      result.current.selectTemplateVariable(result.current.templateFilePanel!.variables[0])
    })
    expect(editorView.state.doc.toString().endsWith("lx-agent")).toBe(true)
    expect(result.current.templateFilePanel).toBeNull()
  })

  it("@content 固定内容块中的引用可作为正文候选，且文件候选排在变量候选之前", () => {
    const doc = [
      "$$$ varTemplate --start 「title: 」",
      "@content:",
      "  - @src/features/foo.ts",
      'fooName: "bar"',
      "$$$ varTemplate --end",
      "",
      "&&& commonTemplate --start",
      "- Location: @src/features/foo-extra.ts",
      "fo",
      "&&& commonTemplate --end",
    ].join("\n")
    const cursor = doc.indexOf("fo\n&&& commonTemplate --end") + 2
    const editorView = createEditorView(doc, cursor)
    const editorRef = { current: editorView }
    const { result } = renderHook(() => useMarkdownPanels({ editorViewRef: editorRef }))

    act(() => {
      result.current.syncTemplateFilePanel(editorView)
    })

    expect(result.current.templateFilePanel?.files.map((file) => file.mentionPath)).toEqual([
      "src/features/foo-extra.ts",
      "src/features/foo.ts",
    ])
    expect(result.current.templateFilePanel?.files.map((file) => file.templateSource)).toEqual([
      "templateBlock",
      "varContentBlock",
    ])
    expect(result.current.templateFilePanel?.variables.map((item) => item.name)).toEqual([
      "fooName",
    ])

    act(() => {
      expect(result.current.handleTemplateFileKey(1)).toBe(true)
      expect(result.current.handleTemplateFileKey(1)).toBe(true)
    })
    expect(result.current.activeTemplateFileIndex).toBe(2)

    act(() => {
      result.current.selectTemplateVariable(result.current.templateFilePanel!.variables[0])
    })
    expect(editorView.state.doc.toString()).toContain("bar")
  })

  it("无命中的字母片段不弹出面板", () => {
    const doc = ["$$$ varTemplate --start", 'repo: "lx-agent"', "$$$ varTemplate --end", "zz"].join(
      "\n",
    )
    const editorView = createEditorView(doc, doc.length)
    const editorRef = { current: editorView }
    const { result } = renderHook(() => useMarkdownPanels({ editorViewRef: editorRef }))

    act(() => {
      result.current.syncTemplateFilePanel(editorView)
    })
    expect(result.current.templateFilePanel).toBeNull()
  })

  it("代码围栏、变量块标记行与旧版 frontmatter 内不触发字母面板", () => {
    const fenceDoc = [
      "$$$ varTemplate --start",
      'repo: "lx-agent"',
      "$$$ varTemplate --end",
      "```",
      "re",
      "```",
    ].join("\n")
    const fenceView = createEditorView(fenceDoc, fenceDoc.indexOf("```\nre") + 6)
    const fenceRef = { current: fenceView }
    const fenceHook = renderHook(() => useMarkdownPanels({ editorViewRef: fenceRef }))
    act(() => {
      fenceHook.result.current.syncTemplateFilePanel(fenceView)
    })
    expect(fenceHook.result.current.templateFilePanel).toBeNull()

    const markerDoc = [
      "$$$ varTemplate --start",
      'repo: "lx-agent"',
      "$$$ varTemplate --start 「title: re",
    ].join("\n")
    const markerView = createEditorView(markerDoc, markerDoc.length)
    const markerRef = { current: markerView }
    const markerHook = renderHook(() => useMarkdownPanels({ editorViewRef: markerRef }))
    act(() => {
      markerHook.result.current.syncTemplateFilePanel(markerView)
    })
    expect(markerHook.result.current.templateFilePanel).toBeNull()

    const frontmatterDoc = ["---", 'repo: "lx-agent"', "re", "---", "正文"].join("\n")
    const frontmatterCursor = frontmatterDoc.indexOf('"lx-agent"\nre') + '"lx-agent"\nre'.length
    const frontmatterView = createEditorView(frontmatterDoc, frontmatterCursor)
    const frontmatterRef = { current: frontmatterView }
    const frontmatterHook = renderHook(() => useMarkdownPanels({ editorViewRef: frontmatterRef }))
    act(() => {
      frontmatterHook.result.current.syncTemplateFilePanel(frontmatterView)
    })
    expect(frontmatterHook.result.current.templateFilePanel).toBeNull()
  })

  it("方括号内的 @ 触发文件提及面板", async () => {
    const doc = "/addContent [@"
    const editorView = createEditorView(doc, doc.length)
    const editorRef = { current: editorView }
    const onSearchFiles = createFileSearch([{ path: "src/a.ts", isDirectory: false }])
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
    expect(result.current.fileMentionPanel?.files[0].mentionPath).toBe("src/a.ts")

    act(() => {
      result.current.selectFileMention(result.current.fileMentionPanel!.files[0])
    })
    expect(editorView.state.doc.toString()).toBe("/addContent [@src/a.ts ")
  })
})

describe("useMarkdownPanels /addContent 命令插入", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("面板选中 /addContent 后插入 [content] 占位并默认选中 content", () => {
    const doc = "/addContent"
    const editorView = createEditorView(doc, doc.length)
    const editorRef = { current: editorView }
    const { result } = renderHook(() => useMarkdownPanels({ editorViewRef: editorRef }))

    act(() => {
      result.current.syncSlashCommandPanel(editorView)
    })
    const command = result.current.slashCommandPanel?.commands.find(
      (item) => item.id === "addContent",
    )
    expect(command).toBeDefined()

    act(() => {
      result.current.selectSlashCommand(command!)
    })
    expect(editorView.state.doc.toString()).toBe("/addContent [content]")
    expect(
      editorView.state.doc.sliceString(
        editorView.state.selection.main.from,
        editorView.state.selection.main.to,
      ),
    ).toBe("content")
  })

  it("变量块内 /addContent 同样出现在面板中", () => {
    const doc = ["$$$ varTemplate --start", "@content:", "/addContent"].join("\n")
    const editorView = createEditorView(doc, doc.length)
    const editorRef = { current: editorView }
    const { result } = renderHook(() => useMarkdownPanels({ editorViewRef: editorRef }))

    act(() => {
      result.current.syncSlashCommandPanel(editorView)
    })
    expect(
      result.current.slashCommandPanel?.commands.filter((item) => item.id === "addContent"),
    ).toHaveLength(1)
  })
})
