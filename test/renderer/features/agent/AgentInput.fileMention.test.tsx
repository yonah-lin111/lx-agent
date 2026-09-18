// @vitest-environment jsdom
import { EditorView } from "@codemirror/view"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AgentInput } from "@/features/agent/components/AgentInput"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import { projectApi } from "@/features/project/api/projectApi"

vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    searchFiles: vi.fn(),
    searchDirectoryFiles: vi.fn(),
  },
}))

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    listPromptTemplates: vi.fn().mockResolvedValue([]),
    listSkills: vi.fn().mockResolvedValue([
      {
        name: "demo-skill",
        description: "Demo skill description",
        shortDescription: "Short desc",
        displayName: "Demo Skill",
      },
    ]),
  },
}))

vi.mock("@/features/agent/api/promptHistoryApi", () => ({
  promptHistoryApi: {
    get: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue([]),
  },
}))

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)
vi.stubGlobal("requestAnimationFrame", ((cb: () => void) => {
  cb()
  return 0
}) as typeof requestAnimationFrame)

describe("AgentInput 文件提及面板唤起", () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.mocked(projectApi.searchFiles).mockReset()
    vi.mocked(projectApi.searchDirectoryFiles).mockReset()
  })

  // 渲染受控 AgentInput harness：返回 CodeMirror 视图（受控 state 经 onChange 回写）。
  const renderMentionInput = async (): Promise<{ view: EditorView }> => {
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
          onClear={vi.fn()}
          onUndo={vi.fn()}
          onCompact={vi.fn()}
          selectedModel="m"
          onModelChange={vi.fn()}
          modelOptions={[]}
          hasModelOptions={false}
          worktreeOptions={null}
          onWorktreeSelect={vi.fn()}
          selectedFiles={[]}
          onFilesChange={vi.fn()}
          supportsImages={false}
          projectId="test-proj"
        />
      )
    }

    render(<Harness />)
    await act(async () => {})
    const content = document.querySelector(".cm-content") as HTMLElement
    const view = EditorView.findFromDOM(content)
    expect(view).not.toBeNull()
    return { view: view as EditorView }
  }

  // 替换全文并把光标置于末尾，模拟连续键入路径。
  const typeText = async (view: EditorView, text: string): Promise<void> => {
    await act(async () => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: text.length },
      })
    })
  }

  it("当存在 projectId 时，输入 @ 应该调用 projectApi.searchFiles", async () => {
    vi.mocked(projectApi.searchFiles).mockResolvedValue([
      { path: "src/index.ts", isDirectory: false },
    ])

    let updateText: (val: string) => void = () => {}
    const Harness = () => {
      const [text, setText] = useState("")
      updateText = setText
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
          onClear={vi.fn()}
          onUndo={vi.fn()}
          onCompact={vi.fn()}
          selectedModel="m"
          onModelChange={vi.fn()}
          modelOptions={[]}
          hasModelOptions={false}
          worktreeOptions={null}
          onWorktreeSelect={vi.fn()}
          selectedFiles={[]}
          onFilesChange={vi.fn()}
          supportsImages={false}
          projectId="test-proj"
          projectPath="/test-proj-path"
          currentPath="/test-proj-path"
        />
      )
    }

    render(<Harness />)
    await act(async () => {})
    const content = document.querySelector(".cm-content") as HTMLElement
    expect(content).not.toBeNull()

    await act(async () => {
      fireEvent.focus(content)
      updateText("@")
    })

    expect(projectApi.searchFiles).toHaveBeenCalledWith("test-proj", "")
    expect(projectApi.searchDirectoryFiles).not.toHaveBeenCalled()
  })

  it("当没有 projectId 只有 currentPath 时（非项目页面或桌面），输入 @ 应该调用 projectApi.searchDirectoryFiles", async () => {
    vi.mocked(projectApi.searchDirectoryFiles).mockResolvedValue([
      { path: "/desktop/doc.txt", isDirectory: false },
    ])

    let updateText: (val: string) => void = () => {}
    const Harness = () => {
      const [text, setText] = useState("")
      updateText = setText
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
          onClear={vi.fn()}
          onUndo={vi.fn()}
          onCompact={vi.fn()}
          selectedModel="m"
          onModelChange={vi.fn()}
          modelOptions={[]}
          hasModelOptions={false}
          worktreeOptions={null}
          onWorktreeSelect={vi.fn()}
          selectedFiles={[]}
          onFilesChange={vi.fn()}
          supportsImages={false}
          currentPath="/desktop"
        />
      )
    }

    render(<Harness />)
    await act(async () => {})
    const content = document.querySelector(".cm-content") as HTMLElement
    expect(content).not.toBeNull()

    await act(async () => {
      fireEvent.focus(content)
      updateText("@")
    })

    expect(projectApi.searchDirectoryFiles).toHaveBeenCalledWith("/desktop", "")
    expect(projectApi.searchFiles).not.toHaveBeenCalled()
  })

  it("输入 @ 时应该在提及面板中展示 Skill 项并带有 Skill 标签", async () => {
    vi.mocked(projectApi.searchFiles).mockResolvedValue([])

    let updateText: (val: string) => void = () => {}
    const Harness = () => {
      const [text, setText] = useState("")
      updateText = setText
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
          onClear={vi.fn()}
          onUndo={vi.fn()}
          onCompact={vi.fn()}
          selectedModel="m"
          onModelChange={vi.fn()}
          modelOptions={[]}
          hasModelOptions={false}
          worktreeOptions={null}
          onWorktreeSelect={vi.fn()}
          selectedFiles={[]}
          onFilesChange={vi.fn()}
          supportsImages={false}
          projectId="test-proj"
        />
      )
    }

    render(<Harness />)
    await act(async () => {})
    const content = document.querySelector(".cm-content") as HTMLElement
    expect(content).not.toBeNull()

    await act(async () => {
      fireEvent.focus(content)
      updateText("@")
    })

    // 验证提及面板已渲染包含 demo-skill 及 Skill 标签
    const skillName = document.querySelector('[data-index="0"]')
    expect(skillName).not.toBeNull()
    expect(skillName?.textContent).toContain("$demo-skill")
    expect(skillName?.textContent).toContain("Skill")
  })

  it("输入 @ 时应该在提及面板中展示 Design 项并带有 Design 标签", async () => {
    vi.mocked(projectApi.searchFiles).mockResolvedValue([])

    frontDesignStore.registerDesign({
      id: "mention-design-1",
      title: "Hero Landing Card",
      html: "<div>Hero HTML</div>",
      sessionId: "test-mention-session",
    })

    let updateText: (val: string) => void = () => {}
    const Harness = () => {
      const [text, setText] = useState("")
      updateText = setText
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
          onClear={vi.fn()}
          onUndo={vi.fn()}
          onCompact={vi.fn()}
          selectedModel="m"
          onModelChange={vi.fn()}
          modelOptions={[]}
          hasModelOptions={false}
          worktreeOptions={null}
          onWorktreeSelect={vi.fn()}
          selectedFiles={[]}
          onFilesChange={vi.fn()}
          supportsImages={false}
          currentSessionId="test-mention-session"
        />
      )
    }

    render(<Harness />)
    await act(async () => {})
    const content = document.querySelector(".cm-content") as HTMLElement
    expect(content).not.toBeNull()

    await act(async () => {
      fireEvent.focus(content)
      updateText("@")
    })

    // 验证提及面板中包含设计项与 Design 标签
    const designItem = document.body.textContent
    expect(designItem).toContain("Hero Landing Card")
    expect(designItem).toContain("Design")
  })

  it("输入 @src 时只展示文件候选，不再混入 Skill", async () => {
    vi.mocked(projectApi.searchFiles).mockResolvedValue([
      { path: "src/index.ts", isDirectory: false },
    ])
    const { view } = await renderMentionInput()

    await typeText(view, "@src")

    expect(projectApi.searchFiles).toHaveBeenCalledWith("test-proj", "src")
    await waitFor(() => {
      expect(document.body.textContent).toContain("index.ts")
    })
    expect(document.body.textContent).not.toContain("$demo-skill")
  })

  it("输入 @skill 时展示 Skill 候选，@skill:xyz 无匹配时隐藏", async () => {
    vi.mocked(projectApi.searchFiles).mockResolvedValue([])
    const { view } = await renderMentionInput()

    await typeText(view, "@skill")
    await waitFor(() => {
      expect(document.body.textContent).toContain("$demo-skill")
    })

    await typeText(view, "@skill:xyz")
    await waitFor(() => {
      expect(document.body.textContent).not.toContain("$demo-skill")
    })
  })

  it("在 @skill 面板点选 Skill 后插入 $name 语法", async () => {
    vi.mocked(projectApi.searchFiles).mockResolvedValue([])
    const { view } = await renderMentionInput()

    await typeText(view, "@skill")

    const option = await screen.findByRole("option", { name: /\$demo-skill/ })
    fireEvent.mouseDown(option)

    expect(view.state.doc.toString()).toBe("$demo-skill ")
  })
})
