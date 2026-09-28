// @vitest-environment jsdom

import { EditorView } from "@codemirror/view"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { LxAgentTopToast, LxToastProvider } from "@/components/ui/LxToast"
import { agentApi } from "@/features/agent/api/agentApi"
import { promptHistoryApi } from "@/features/agent/api/promptHistoryApi"
import { AgentInput } from "@/features/agent/components/AgentInput"

vi.mock("@/features/agent/api/promptHistoryApi", () => ({
  promptHistoryApi: { get: vi.fn(), add: vi.fn() },
}))

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    listPromptTemplates: vi.fn().mockResolvedValue([]),
    listSkills: vi.fn().mockResolvedValue([]),
    getDefaultPath: vi.fn().mockResolvedValue(""),
    exportSession: vi.fn().mockResolvedValue({ ok: true, canceled: false, filePath: "/tmp/out" }),
    copySession: vi.fn(),
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

vi.mock("@/features/agent/hooks/sessionListStore", () => ({
  sessionListStore: {
    getSessions: vi.fn().mockReturnValue([]),
    getCurrentSessionId: vi.fn().mockReturnValue(null),
    subscribe: vi.fn().mockReturnValue(() => undefined),
  },
}))

vi.mock("@/features/agent/hooks/agentTabStore", () => ({
  agentTabStore: {
    getActiveTab: vi.fn().mockReturnValue(null),
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
vi.stubGlobal("requestAnimationFrame", (() => 0) as typeof requestAnimationFrame)

beforeAll(() => {
  const rect = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect
  Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => rect
})

const renderInput = async (
  initialText: string,
): Promise<{ content: HTMLElement; view: EditorView }> => {
  vi.mocked(promptHistoryApi.get).mockResolvedValue([])
  const Harness = (): React.JSX.Element => {
    const [text, setText] = useState(initialText)
    return (
      <LxToastProvider>
        <LxAgentTopToast />
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
          modelOptions={[{ label: "M", options: [{ label: "m", value: "m" }] }]}
          hasModelOptions
          worktreeOptions={null}
          onWorktreeSelect={vi.fn()}
          selectedFiles={[]}
          onFilesChange={vi.fn()}
          supportsImages={false}
          projectId="proj-1"
          projectPath="/proj"
        />
      </LxToastProvider>
    )
  }
  render(<Harness />)
  await act(async () => {})
  const content = document.querySelector(".cm-content") as HTMLElement | null
  expect(content).not.toBeNull()
  const view = EditorView.findFromDOM(content as HTMLElement)
  expect(view).not.toBeNull()
  view!.coordsAtPos = vi.fn().mockReturnValue({ left: 10, right: 20, top: 10, bottom: 20 })
  return { content: content as HTMLElement, view: view! }
}

describe("AgentInput /export 二级格式面板", () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.mocked(promptHistoryApi.get).mockReset()
    vi.mocked(agentApi.exportSession).mockClear()
  })

  it("输入 /export - 弹出格式面板，选中 html 立即执行导出并清空输入", async () => {
    const { content } = await renderInput("")
    const view = EditorView.findFromDOM(content)!

    act(() => {
      view.dispatch({ changes: { from: 0, insert: "/export -" }, selection: { anchor: 9 } })
    })

    const htmlOption = await screen.findByRole("option", { name: /html/ })
    fireEvent.mouseDown(htmlOption)

    await waitFor(() => {
      expect(agentApi.exportSession).toHaveBeenCalledWith({
        format: "html",
        openAfterExport: true,
      })
    })
    expect(view.state.doc.toString()).toBe("")
  })

  it("输入 /export -json 回车执行 JSONL 导出", async () => {
    const { content } = await renderInput("")
    const view = EditorView.findFromDOM(content)!

    act(() => {
      view.dispatch({ changes: { from: 0, insert: "/export -json" }, selection: { anchor: 12 } })
    })
    await act(async () => {})
    await screen.findByRole("option", { name: /json/ })

    fireEvent.keyDown(content, { key: "Enter" })

    await waitFor(() => {
      expect(agentApi.exportSession).toHaveBeenCalledWith({
        format: "jsonl",
        openAfterExport: true,
      })
    })
  })

  it("一级面板选中 /export 后回显 /export - 并进入格式面板", async () => {
    const { content } = await renderInput("")
    const view = EditorView.findFromDOM(content)!

    act(() => {
      view.dispatch({ changes: { from: 0, insert: "/export" }, selection: { anchor: 7 } })
    })
    await act(async () => {})
    await screen.findByRole("option", { name: /\/export/ })

    fireEvent.keyDown(content, { key: "Enter" })
    await act(async () => {})

    expect(view.state.doc.toString()).toBe("/export -")
    // 二级格式面板出现。
    await screen.findByRole("option", { name: /md/ })
  })

  it("显式写了 - 但格式无法识别：提示选择且不执行、输入保留", async () => {
    const { content } = await renderInput("")
    const view = EditorView.findFromDOM(content)!

    act(() => {
      view.dispatch({ changes: { from: 0, insert: "/export -xml" }, selection: { anchor: 11 } })
    })
    await act(async () => {})

    fireEvent.keyDown(content, { key: "Enter" })

    expect(await screen.findByText("Choose an export format (html / md / json)")).toBeDefined()
    expect(agentApi.exportSession).not.toHaveBeenCalled()
    expect(view.state.doc.toString()).toBe("/export -xml")
  })
})
