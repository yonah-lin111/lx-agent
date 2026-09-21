// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { getMatchedCommands } from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"
import { useAgentInputPanels } from "@/features/agent/components/AgentInput/AgentMarkdownInput/hooks/useAgentInputPanels"

// 统一 mock 面板 hook 的外部数据源。
vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    listPromptTemplates: vi.fn().mockResolvedValue([]),
    listSkills: vi.fn().mockResolvedValue([]),
    getDefaultPath: vi.fn().mockResolvedValue(""),
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
    subscribe: vi.fn().mockReturnValue(() => undefined),
  },
}))

vi.mock("@/features/agent/hooks/frontDesignStore", () => ({
  frontDesignStore: {
    getAllDesigns: vi.fn().mockReturnValue([]),
  },
}))

// 渲染面板 hook 的最小参数。
const renderPanels = (params: {
  value: string
  modelOptions?: { label: string; value?: string; options?: { label: string; value: string }[] }[]
  worktreeOptions?:
    | {
        name: string
        path: string
        branch: string | null
        isDefault: boolean
        isCurrent: boolean
      }[]
    | null
}) => {
  const editorViewRef = { current: null } as unknown as React.RefObject<
    import("@codemirror/view").EditorView | null
  >
  return renderHook(() =>
    useAgentInputPanels({
      value: params.value,
      editorViewRef,
      modelOptions: params.modelOptions ?? [],
      worktreeOptions: params.worktreeOptions,
      getPanelAnchor: () => null,
      t: ((key: string) => key) as never,
    }),
  )
}

describe("二级命令面板模糊匹配（仅名称）", () => {
  it("一级命令只按名称模糊，不匹配描述", () => {
    // 描述含中文时，用描述词查询不应命中。
    const descT = (() => "清空当前会话") as never
    expect(getMatchedCommands("/清空", [], descT).some((c) => c.id === "clear")).toBe(false)
    // 名称子序列仍可命中。
    const keyT = ((key: string) => key) as never
    expect(getMatchedCommands("/clr", [], keyT).some((c) => c.id === "clear")).toBe(true)
    // 别名保持可用。
    expect(getMatchedCommands("/new", [], keyT).some((c) => c.id === "clear")).toBe(true)
    expect(getMatchedCommands("/res", [], keyT).some((c) => c.id === "session")).toBe(true)
  })

  it("/model 按 label 模糊，不匹配 provider", () => {
    const modelOptions = [
      {
        label: "anthropic",
        options: [
          { label: "claude-sonnet", value: "claude-sonnet" },
          { label: "gpt-5", value: "gpt-5" },
        ],
      },
    ]
    const { result } = renderPanels({ value: "/model clde", modelOptions })
    expect(result.current.matchedModels.map((m) => m.label)).toEqual(["claude-sonnet"])
    // provider 专属词不应命中。
    const providerOnly = renderPanels({ value: "/model anthropicx", modelOptions })
    expect(providerOnly.result.current.matchedModels).toHaveLength(0)
  })

  it("/gitWorktree 按 name 模糊，不匹配 path", () => {
    const worktreeOptions = [
      {
        name: "develop",
        path: "/repo/develop-wt",
        branch: "develop",
        isDefault: false,
        isCurrent: false,
      },
      { name: "main", path: "/repo/main-wt", branch: "main", isDefault: true, isCurrent: true },
    ]
    const { result } = renderPanels({ value: "/gitWorktree dvp", worktreeOptions })
    expect(result.current.matchedWorktrees.map((w) => w.name)).toEqual(["develop"])
    // 路径片段不应命中。
    const pathOnly = renderPanels({ value: "/gitWorktree main-wt", worktreeOptions })
    expect(pathOnly.result.current.matchedWorktrees).toHaveLength(0)
  })

  it("/project 按 name 模糊，不匹配 path", async () => {
    const { projectApi } = await import("@/features/project/api/projectApi")
    vi.mocked(projectApi.listProjects).mockResolvedValue([
      {
        id: "p1",
        name: "Alpha",
        type: "filesystem",
        path: "/repo/alpha",
        referencedFolders: [],
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "p2",
        name: "Beta",
        type: "filesystem",
        path: "/repo/beta",
        referencedFolders: [],
        createdAt: "",
        updatedAt: "",
      },
    ])
    const { result } = renderPanels({ value: "/project alp" })
    await waitFor(() => {
      expect(result.current.matchedProjects.map((p) => p.name)).toEqual(["Alpha"])
    })
    // 路径片段不应命中（名称无子序列时为空）。
    const pathOnly = renderPanels({ value: "/project /repo/beta" })
    await waitFor(() => {
      expect(pathOnly.result.current.matchedProjects).toHaveLength(0)
    })
  })

  it("/session 按 title 模糊，不匹配 id", async () => {
    const { sessionListStore } = await import("@/features/agent/hooks/sessionListStore")
    vi.mocked(sessionListStore.getSessions).mockReturnValue([
      {
        id: "sess-xyz-123",
        title: "Hello World",
        cwd: "",
        projectId: null,
        pinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "sess-abc-456",
        title: "Second Chat",
        cwd: "",
        projectId: null,
        pinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])
    const { result } = renderPanels({ value: "/session hlow" })
    expect(result.current.matchedSessions.map((s) => s.title)).toEqual(["Hello World"])
    // id 片段不应命中。
    const idOnly = renderPanels({ value: "/session xyz" })
    expect(idOnly.result.current.matchedSessions).toHaveLength(0)
  })
})
