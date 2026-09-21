import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({
  mcpStatus: [] as Array<{ name: string; status: string }>,
  mcpServers: {} as Record<string, unknown>,
  skills: [] as Array<{ name: string }>,
  disabledSkills: [] as string[],
  cwd: undefined as string | undefined,
}))

vi.mock("@/agent/mcp/mcpManager", () => ({
  mcpManager: {
    getStatus: () => holder.mcpStatus,
    getServers: () => holder.mcpServers,
  },
}))
vi.mock("@/agent/skills/skillLoader", () => ({
  skillLoader: { load: () => holder.skills },
}))
vi.mock("@/agent/cwdResolver", () => ({
  resolveCwd: () => holder.cwd,
}))
vi.mock("@/services/settingsService/skills", () => ({
  getSkillSettings: () => ({ disabled: holder.disabledSkills }),
}))
vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return { ...actual, getConfigPath: () => "/tmp/nonexistent-config.json" }
})

import { getSubagentCapabilityCatalog } from "@/services/settingsService"

beforeEach(() => {
  holder.mcpStatus = []
  holder.mcpServers = {}
  holder.skills = []
  holder.disabledSkills = []
  holder.cwd = undefined
})

describe("getSubagentCapabilityCatalog", () => {
  it("聚合内置工具、MCP server（含连接状态）、skill（含禁用状态）与子代理角色，并按名称排序", () => {
    holder.mcpServers = { github: {}, codegraph: {} }
    holder.mcpStatus = [
      { name: "codegraph", status: "connected" },
      { name: "github", status: "failed" },
    ]
    holder.skills = [{ name: "deploy" }, { name: "code-review" }]
    holder.disabledSkills = ["deploy"]

    const catalog = getSubagentCapabilityCatalog()

    expect(catalog.tools).toContain("read")
    expect(catalog.tools).toContain("task")
    expect(catalog.tools).not.toContain("web_search")
    expect(catalog.mcp).toEqual([
      { name: "codegraph", connected: true },
      { name: "github", connected: false },
    ])
    expect(catalog.skills).toEqual([
      { name: "code-review", disabled: false },
      { name: "deploy", disabled: true },
    ])
    // 未配置用户角色时仅内置 explorer / worker（顺序固定）。
    expect(catalog.subagents).toEqual([
      { name: "explorer", builtIn: true },
      { name: "worker", builtIn: true },
    ])
  })

  it("空环境返回空 MCP/skill 清单与完整工具全集", () => {
    const catalog = getSubagentCapabilityCatalog()

    expect(catalog.mcp).toEqual([])
    expect(catalog.skills).toEqual([])
    expect(catalog.tools.length).toBeGreaterThan(0)
    expect(catalog.subagents.map((item) => item.name)).toEqual(["explorer", "worker"])
  })
})
