import { AGENT_CHANNELS } from "@shared/ipc/agentChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn() },
  webUtils: { getPathForFile: vi.fn() },
}))

describe("preload skill 工作区 API", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    await import("../../src/preload/index")
  })

  it("转发 Skill 文件操作到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]

    await api.agent.listSkillFiles("/skill")
    await api.agent.readSkillFile("/skill", "references/a.md")
    await api.agent.writeSkillFile("/skill", "references/a.md", "content")
    await api.agent.deleteSkillFile("/skill", "references/a.md")
    await api.agent.moveSkillFile("/skill", "a.md", "b.md")
    await api.agent.importSkillFiles("/skill", "assets", "Import Files")
    await api.agent.saveSkill({ scope: "user", targetRoot: "lx", name: "x", description: "y" })

    expect(invoke).toHaveBeenNthCalledWith(1, AGENT_CHANNELS.listSkillFiles, "/skill")
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      AGENT_CHANNELS.readSkillFile,
      "/skill",
      "references/a.md",
    )
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      AGENT_CHANNELS.writeSkillFile,
      "/skill",
      "references/a.md",
      "content",
    )
    expect(invoke).toHaveBeenNthCalledWith(
      4,
      AGENT_CHANNELS.deleteSkillFile,
      "/skill",
      "references/a.md",
    )
    expect(invoke).toHaveBeenNthCalledWith(
      5,
      AGENT_CHANNELS.moveSkillFile,
      "/skill",
      "a.md",
      "b.md",
    )
    expect(invoke).toHaveBeenNthCalledWith(
      6,
      AGENT_CHANNELS.importSkillFiles,
      "/skill",
      "assets",
      "Import Files",
    )
    expect(invoke).toHaveBeenNthCalledWith(7, AGENT_CHANNELS.saveSkill, {
      scope: "user",
      targetRoot: "lx",
      name: "x",
      description: "y",
    })
  })

  it("转发 AGENTS.md 指令文件读写到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]

    await api.agent.getInstruction("project", "/proj")
    await api.agent.saveInstruction({ scope: "user", content: "hello" })

    expect(invoke).toHaveBeenNthCalledWith(1, AGENT_CHANNELS.getInstruction, "project", "/proj")
    expect(invoke).toHaveBeenNthCalledWith(2, AGENT_CHANNELS.saveInstruction, {
      scope: "user",
      content: "hello",
    })
  })
})
