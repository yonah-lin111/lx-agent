// @vitest-environment jsdom

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
    exportSession: vi.fn(),
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

vi.mock("@/features/agent/hooks/frontDesignStore", () => ({
  frontDesignStore: {
    getAllDesigns: vi.fn().mockReturnValue([]),
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

const UNKNOWN_TOAST = 'Unknown command /cleawr. Type "/" to see available commands.'

// 受控输入 harness：返回编辑器节点、发送回调与 btw 发送回调。
const renderInput = async (options?: {
  initialText?: string
  canUseBtw?: boolean
}): Promise<{
  content: HTMLElement
  onSend: ReturnType<typeof vi.fn>
  onBtwSend: ReturnType<typeof vi.fn>
}> => {
  vi.mocked(promptHistoryApi.get).mockResolvedValue([])
  vi.mocked(promptHistoryApi.add).mockResolvedValue([])
  const onSend = vi.fn()
  const onBtwSend = vi.fn()
  const Harness = (): React.JSX.Element => {
    const [text, setText] = useState(options?.initialText ?? "")
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
          onSend={onSend}
          onBtwSend={onBtwSend}
          canUseBtw={options?.canUseBtw ?? true}
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
  return { content: content as HTMLElement, onSend, onBtwSend }
}

describe("AgentInput 斜杠命令校验", () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.mocked(promptHistoryApi.get).mockReset()
    vi.mocked(promptHistoryApi.add).mockReset()
    vi.mocked(promptHistoryApi.add).mockResolvedValue([])
    vi.mocked(agentApi.listPromptTemplates).mockReset()
    vi.mocked(agentApi.listPromptTemplates).mockResolvedValue([])
  })

  it("未知命令回车：提示并拒绝发送，输入内容保留", async () => {
    const { content, onSend } = await renderInput({ initialText: "/cleawr 你好" })

    fireEvent.keyDown(content, { key: "Enter" })

    expect(await screen.findByText(UNKNOWN_TOAST)).toBeDefined()
    expect(onSend).not.toHaveBeenCalled()
    // 输入未清空，便于修正。
    expect(content.textContent).toBe("/cleawr 你好")
  })

  it("未知命令点击发送按钮：同样拦截", async () => {
    const { onSend } = await renderInput({ initialText: "/cleawr 你好" })

    fireEvent.click(screen.getByRole("button", { name: "Send" }))

    expect(await screen.findByText(UNKNOWN_TOAST)).toBeDefined()
    expect(onSend).not.toHaveBeenCalled()
  })

  it("以路径开头的普通消息不视为命令，正常发送", async () => {
    const { content, onSend } = await renderInput({
      initialText: "/usr/local/bin 这个目录是什么",
    })

    fireEvent.keyDown(content, { key: "Enter" })

    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it("已加载的自定义模板命令放行", async () => {
    vi.mocked(agentApi.listPromptTemplates).mockResolvedValue([
      {
        name: "review",
        description: "Review code",
        source: "project",
        filePath: "/proj/.lx/command/agentInput/review.md",
      },
    ])
    const { content, onSend } = await renderInput({ initialText: "/review -branch" })

    fireEvent.keyDown(content, { key: "Enter" })

    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it("/skill: 语法放行", async () => {
    const { content, onSend } = await renderInput({ initialText: "/skill:frontend-design 帮我" })

    fireEvent.keyDown(content, { key: "Enter" })

    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it("/steer 未填写内容：提示补参并拒绝发送", async () => {
    const { content, onSend } = await renderInput({ initialText: "/steer -prompt" })

    fireEvent.keyDown(content, { key: "Enter" })

    expect(await screen.findByText("Add the steer content before sending")).toBeDefined()
    expect(onSend).not.toHaveBeenCalled()
  })

  it("/steer 填写内容后走 steer 发送", async () => {
    const { content, onSend } = await renderInput({ initialText: "/steer -改为直接回答" })

    fireEvent.keyDown(content, { key: "Enter" })

    expect(onSend).toHaveBeenCalledWith({ delivery: "steer" })
  })

  it("/btw 未填写问题：提示补参并拒绝路由", async () => {
    const { content, onBtwSend } = await renderInput({ initialText: "/btw -prompt" })

    fireEvent.keyDown(content, { key: "Enter" })

    expect(await screen.findByText("Enter a question for /btw")).toBeDefined()
    expect(onBtwSend).not.toHaveBeenCalled()
  })

  it("/btw 填写问题后路由到侧问线", async () => {
    const { content, onBtwSend } = await renderInput({ initialText: "/btw -这个问题在哪？" })

    fireEvent.keyDown(content, { key: "Enter" })

    await waitFor(() => {
      expect(onBtwSend).toHaveBeenCalledWith("这个问题在哪？")
    })
  })
})
