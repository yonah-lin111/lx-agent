// @vitest-environment jsdom

import type { EditorView } from "@codemirror/view"
import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  getCommandTagLabel,
  getMatchedCommands,
  getMentionSkillCandidates,
  isKindTagMatch,
  isSubagentTagMatch,
} from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"
import { useAgentInputPanels } from "@/features/agent/components/AgentInput/AgentMarkdownInput/hooks/useAgentInputPanels"

// 复用二级面板测试的 mock 结构，仅补足 tag 测试所需的非空数据。
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

// 中英文 tag 映射：与面板实际渲染一致。
const tagT = ((key: string): string => {
  if (key === "agent.subagentMentionTag") return "子代理"
  if (key === "settings.subagentsCustomTag") return "自定义"
  return key
}) as never

const keyT = ((key: string): string => key) as never

// 模板命令夹具。
const templates = [
  { name: "deploy", description: "部署脚本", source: "project", filePath: "/p/deploy.md" },
  { name: "review", description: "代码评审", source: "user", filePath: "/u/review.md" },
] as never

describe("tag 模糊匹配（@ 与 /）", () => {
  it("/ 按 tag 模糊过滤，与名称取并集且不重排", () => {
    // tag 命中：拼写缺字母仍可召回整类。
    const builtinHit = getMatchedCommands("/bltin", [], keyT)
    expect(builtinHit.some((c) => c.id === "clear")).toBe(true)
    expect(builtinHit.every((c) => c.kind === "builtin")).toBe(true)
    // 大写同样命中（归一化）。
    expect(getMatchedCommands("/BLTIN", [], keyT).some((c) => c.id === "clear")).toBe(true)
    // custom 同时命中项目级与全局级。
    const customHit = getMatchedCommands("/custom", templates, keyT)
    expect(customHit.some((c) => c.id === "prompt:deploy")).toBe(true)
    expect(customHit.some((c) => c.id === "prompt:review")).toBe(true)
    expect(customHit.some((c) => c.id === "clear")).toBe(false)
    // project 为名称与 tag 的并集。
    const projectHit = getMatchedCommands("/project", templates, keyT)
    expect(projectHit.some((c) => c.id === "project")).toBe(true)
    expect(projectHit.some((c) => c.id === "prompt:deploy")).toBe(true)
    // 排序保持原数组序：builtin 在前。
    expect(projectHit.findIndex((c) => c.id === "project")).toBeLessThan(
      projectHit.findIndex((c) => c.id === "prompt:deploy"),
    )
    // 描述仍不参与匹配。
    const descT = (() => "清空当前会话") as never
    expect(getMatchedCommands("/清空", [], descT).some((c) => c.id === "clear")).toBe(false)
    // 空查询返回全量。
    expect(getMatchedCommands("/", [], keyT).length).toBeGreaterThan(0)
  })

  it("getCommandTagLabel 与面板渲染一致", () => {
    expect(getCommandTagLabel({ kind: "builtin" })).toBe("Builtin")
    expect(getCommandTagLabel({ kind: "skill" })).toBe("Skill")
    expect(getCommandTagLabel({ kind: "prompt", source: "project" })).toBe("Custom|Project")
    expect(getCommandTagLabel({ kind: "prompt", source: "user" })).toBe("Custom|Global")
  })

  it("@ skill tag 可绕过前缀门控整类返回", () => {
    const skills = [
      {
        name: "demo-skill",
        description: "Demo skill description",
        filePath: "/s/demo/SKILL.md",
        baseDir: "/s/demo",
        disableModelInvocation: false,
      },
    ] as never
    // 模糊 tag 命中整类。
    expect(getMentionSkillCandidates(skills, "skl")).toHaveLength(1)
    expect(getMentionSkillCandidates(skills, "SKL")).toHaveLength(1)
    // 非 tag 查询仍为空。
    expect(getMentionSkillCandidates(skills, "xyz")).toHaveLength(0)
    // 前缀余量过滤保持不变。
    expect(getMentionSkillCandidates(skills, "skill:demo")).toHaveLength(1)
    expect(getMentionSkillCandidates(skills, "skill:zzz")).toHaveLength(0)
  })

  it("子代理 tag 中英文兜底", () => {
    expect(isSubagentTagMatch("子代", true, "子代理", "自定义")).toBe(true)
    expect(isSubagentTagMatch("agn", true, "子代理", "自定义")).toBe(true)
    expect(isSubagentTagMatch("cus", false, "子代理", "自定义")).toBe(true)
    expect(isSubagentTagMatch("自定义", false, "子代理", "自定义")).toBe(true)
    // 内置 tag 不应命中自定义项。
    expect(isSubagentTagMatch("agn", false, "子代理", "自定义")).toBe(false)
    expect(isKindTagMatch("des", "design")).toBe(true)
    expect(isKindTagMatch("xyz", "design")).toBe(false)
  })
})

// 渲染面板 hook 并强制进入 @ 文件模式。
const renderMentionPanels = (value: string) => {
  const editorViewRef = { current: null } as unknown as React.RefObject<EditorView | null>
  return renderHook(() =>
    useAgentInputPanels({
      value,
      editorViewRef,
      currentPath: "/repo",
      getPanelAnchor: () => null,
      t: tagT,
    }),
  )
}

// 同步面板状态：value 固定为渲染入参，cursor 取末尾。
const activateFileMode = (hook: { current: { syncPanels: Function } }, value: string): void => {
  act(() => {
    hook.current.syncPanels(value, value.length, {} as EditorView)
  })
}

describe("@ 面板 hook tag 通道集成", () => {
  it("@skl 整类返回 skill", async () => {
    const { agentApi } = await import("@/features/agent/api/agentApi")
    vi.mocked(agentApi.listSkills).mockResolvedValue([
      {
        name: "demo-skill",
        description: "Demo skill description",
        filePath: "/s/demo/SKILL.md",
        baseDir: "/s/demo",
        disableModelInvocation: false,
      },
    ])
    const { result } = renderMentionPanels("@skl")
    activateFileMode(result, "@skl")
    await waitFor(() => {
      expect(result.current.mentionItems.some((i) => i.kind === "skill")).toBe(true)
    })
    vi.mocked(agentApi.listSkills).mockResolvedValue([])
  })

  it("@子代与 @agn 命中内置子代理，@xyz 不混排", async () => {
    const { settingsApi } = await import("@/features/settings")
    vi.mocked(settingsApi.getSubagentBuiltins).mockResolvedValue([
      { name: "coder", description: "写代码" },
    ])
    const zh = renderMentionPanels("@子代")
    activateFileMode(zh.result, "@子代")
    await waitFor(() => {
      expect(zh.result.current.mentionItems.some((i) => i.kind === "subagent")).toBe(true)
    })
    zh.unmount()
    const en = renderMentionPanels("@agn")
    activateFileMode(en.result, "@agn")
    await waitFor(() => {
      expect(en.result.current.mentionItems.some((i) => i.kind === "subagent")).toBe(true)
    })
    en.unmount()
    const none = renderMentionPanels("@xyz")
    activateFileMode(none.result, "@xyz")
    await waitFor(() => {
      expect(none.result.current.mentionItems.filter((i) => i.kind === "subagent")).toHaveLength(0)
    })
    none.unmount()
    vi.mocked(settingsApi.getSubagentBuiltins).mockResolvedValue([])
  })

  it("@des 整类返回设计", async () => {
    const { frontDesignStore } = await import("@/features/agent/hooks/frontDesignStore")
    vi.mocked(frontDesignStore.getAllDesigns).mockReturnValue([
      {
        id: "d1",
        title: "Landing",
        html: "<div></div>",
        updatedAt: 1,
        sessionId: null,
      },
    ])
    const { result, unmount } = renderMentionPanels("@des")
    activateFileMode(result, "@des")
    await waitFor(() => {
      expect(result.current.mentionItems.some((i) => i.kind === "design")).toBe(true)
    })
    unmount()
    vi.mocked(frontDesignStore.getAllDesigns).mockReturnValue([])
  })

  it("@cla 整类返回 claw，实例名参与匹配", async () => {
    const { settingsApi } = await import("@/features/settings")
    vi.mocked(settingsApi.getOpenClawSettings).mockResolvedValue({
      instances: {
        i1: {
          name: "办公区",
          gatewayUrl: "ws://127.0.0.1:18789",
          authMode: "token",
          enabled: true,
          agents: [{ id: "a1", name: "小助" }],
        },
      },
    })
    const kind = renderMentionPanels("@cla")
    activateFileMode(kind.result, "@cla")
    await waitFor(() => {
      expect(kind.result.current.mentionItems.some((i) => i.kind === "claw")).toBe(true)
    })
    kind.unmount()
    const byInstance = renderMentionPanels("@办公")
    activateFileMode(byInstance.result, "@办公")
    await waitFor(() => {
      expect(byInstance.result.current.mentionItems.some((i) => i.kind === "claw")).toBe(true)
    })
    byInstance.unmount()
    vi.mocked(settingsApi.getOpenClawSettings).mockResolvedValue({ instances: {} })
  })
})
