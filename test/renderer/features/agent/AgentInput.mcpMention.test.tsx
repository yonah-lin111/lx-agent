// @vitest-environment jsdom
import { EditorView } from "@codemirror/view"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agentApi } from "@/features/agent/api/agentApi"
import { AgentInput } from "@/features/agent/components/AgentInput"
import { projectApi } from "@/features/project/api/projectApi"
import { settingsApi } from "@/features/settings"

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    listPromptTemplates: vi.fn().mockResolvedValue([]),
    listSkills: vi.fn().mockResolvedValue([]),
    getDefaultPath: vi.fn().mockResolvedValue(""),
    getMcpStatus: vi.fn().mockResolvedValue([]),
    onEvent: vi.fn().mockReturnValue(() => undefined),
  },
}))

vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    listProjects: vi.fn().mockResolvedValue([]),
    searchFiles: vi.fn().mockResolvedValue([]),
    searchDirectoryFiles: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock("@/features/settings", () => ({
  settingsApi: {
    getSkillSettings: vi.fn().mockResolvedValue({ disabled: [] }),
    getOpenClawSettings: vi.fn().mockResolvedValue({ instances: {} }),
    getSubagentBuiltins: vi.fn().mockResolvedValue([]),
    getSubagentSettings: vi.fn().mockResolvedValue({ roles: {} }),
  },
  subscribeSettingsChanged: vi.fn().mockReturnValue(() => undefined),
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

// 受控 AgentInput harness：返回 CodeMirror 视图（受控 state 经 onChange 回写）。
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

// 按 data-index 收集当前面板行文本。
const panelRowTexts = (): string[] =>
  Array.from(document.querySelectorAll('[role="option"]')).map((row) => row.textContent ?? "")

const mcpStatusFixtures = () => [
  { name: "codegraph", status: "connected" as const, toolsCount: 3 },
  { name: "context7", status: "failed" as const, toolsCount: 0 },
  { name: "foo", status: "disabled" as const, toolsCount: 0 },
]

describe("AgentInput @ 提及选择 MCP", () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.mocked(agentApi.listPromptTemplates).mockResolvedValue([])
    vi.mocked(agentApi.listSkills).mockResolvedValue([])
    vi.mocked(agentApi.getMcpStatus).mockResolvedValue(mcpStatusFixtures())
    vi.mocked(projectApi.searchFiles).mockResolvedValue([])
    vi.mocked(settingsApi.getSubagentBuiltins).mockResolvedValue([])
    vi.mocked(settingsApi.getOpenClawSettings).mockResolvedValue({ instances: {} })
  })

  it("只展示已连接的 server，failed / disabled 不出现", async () => {
    const { view } = await renderMentionInput()

    await typeText(view, "@mcp")

    await waitFor(() => {
      expect(document.body.textContent).toContain("@mcp:codegraph")
    })
    expect(document.body.textContent).toContain("MCP")
    expect(document.body.textContent).not.toContain("context7")
    expect(document.body.textContent).not.toContain("@mcp:foo")
  })

  it("mcp: 前缀按 server 名过滤，非 tag 查询不参与候补", async () => {
    const { view } = await renderMentionInput()

    await typeText(view, "@mcp:cod")
    await waitFor(() => {
      expect(document.body.textContent).toContain("@mcp:codegraph")
    })

    await typeText(view, "@xyz")
    await waitFor(() => {
      expect(document.body.textContent).not.toContain("@mcp:codegraph")
    })
  })

  it("点选 MCP 项后插入 @mcp:<server> 语法", async () => {
    const { view } = await renderMentionInput()

    await typeText(view, "@mcp")

    const option = await screen.findByRole("option", { name: /@mcp:codegraph/ })
    fireEvent.mouseDown(option)

    expect(view.state.doc.toString()).toBe("@mcp:codegraph ")
  })

  it("@ 面板顺序为 agent(子代理) → skill → mcp → 文件 → openclaw", async () => {
    vi.mocked(agentApi.listSkills).mockResolvedValue([
      {
        name: "demo-skill",
        description: "Demo skill description",
        filePath: "/s/demo/SKILL.md",
        baseDir: "/s/demo",
        disableModelInvocation: false,
      },
    ] as never)
    vi.mocked(settingsApi.getSubagentBuiltins).mockResolvedValue([
      { name: "explorer", description: "Read-only explorer" },
    ] as never)
    vi.mocked(projectApi.searchFiles).mockResolvedValue([
      { path: "src/index.ts", isDirectory: false },
    ])
    vi.mocked(settingsApi.getOpenClawSettings).mockResolvedValue({
      instances: {
        local: {
          enabled: true,
          name: "本地实例",
          agents: [{ id: "lily", name: "Lily" }],
        },
      },
    } as never)

    const { view } = await renderMentionInput()

    await typeText(view, "@")

    await waitFor(() => {
      expect(document.body.textContent).toContain("@mcp:codegraph")
    })
    const texts = panelRowTexts()
    const indexOf = (needle: string): number => texts.findIndex((text) => text.includes(needle))

    expect(indexOf("@agent:explorer")).toBeGreaterThanOrEqual(0)
    expect(indexOf("$demo-skill")).toBeGreaterThan(indexOf("@agent:explorer"))
    expect(indexOf("@mcp:codegraph")).toBeGreaterThan(indexOf("$demo-skill"))
    expect(indexOf("index.ts")).toBeGreaterThan(indexOf("@mcp:codegraph"))
    expect(indexOf("Lily")).toBeGreaterThan(indexOf("index.ts"))
  })

  it("光标在 @mcp: token 末尾空格后按 Backspace 整块删除", async () => {
    const { view } = await renderMentionInput()

    await typeText(view, "@mcp:codegraph ")
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    await act(async () => {})

    const editor = document.querySelector(".cm-content") as HTMLElement
    fireEvent.keyDown(editor, { key: "Backspace" })

    expect(view.state.doc.toString()).toBe("")
  })
})
