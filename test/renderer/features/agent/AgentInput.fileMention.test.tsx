// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AgentInput } from "@/features/agent/components/AgentInput"
import { projectApi } from "@/features/project/api/projectApi"

vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    searchFiles: vi.fn(),
    searchDirectoryFiles: vi.fn(),
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
})
