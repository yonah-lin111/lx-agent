import { AGENT_CHANNELS } from "@shared/ipc/agentChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.hoisted(() => vi.fn())
const showOpenDialog = vi.hoisted(() => vi.fn())

vi.mock("electron", () => ({
  ipcMain: { handle },
  dialog: { showOpenDialog },
}))

const workspaceService = vi.hoisted(() => ({
  listSkillFiles: vi.fn(() => []),
  readSkillFile: vi.fn(() => ({ ok: true, content: "" })),
  writeSkillFile: vi.fn(() => ({ ok: true })),
  deleteSkillFile: vi.fn(async () => ({ ok: true })),
  moveSkillFile: vi.fn(() => ({ ok: true })),
  importSkillFiles: vi.fn((): { ok: boolean; files: string[] } => ({ ok: true, files: [] })),
  saveSkill: vi.fn(() => ({ ok: true, filePath: "/x/SKILL.md", baseDir: "/x" })),
}))
vi.mock("@/services/skillWorkspaceService", () => workspaceService)

const instructionService = vi.hoisted(() => ({
  getInstruction: vi.fn(),
  saveInstruction: vi.fn(),
}))
vi.mock("@/services/instructionService", () => instructionService)

// skillHandlers 覆盖的全部 invoke channel。
const SKILL_HANDLER_CHANNELS = [
  AGENT_CHANNELS.listSkillFiles,
  AGENT_CHANNELS.readSkillFile,
  AGENT_CHANNELS.writeSkillFile,
  AGENT_CHANNELS.deleteSkillFile,
  AGENT_CHANNELS.moveSkillFile,
  AGENT_CHANNELS.importSkillFiles,
  AGENT_CHANNELS.saveSkill,
  AGENT_CHANNELS.getInstruction,
  AGENT_CHANNELS.saveInstruction,
] as const

// 从注册结果中取出指定 channel 的 handler。
const handlerFor = (channel: string): ((event: unknown, ...args: unknown[]) => unknown) => {
  const call = handle.mock.calls.find(([registered]) => registered === channel)
  expect(call).toBeDefined()
  return call?.[1] as (event: unknown, ...args: unknown[]) => unknown
}

describe("skill IPC handlers", () => {
  beforeEach(() => {
    handle.mockClear()
    showOpenDialog.mockReset()
    for (const fn of Object.values(workspaceService)) fn.mockClear()
    instructionService.getInstruction.mockReset()
    instructionService.saveInstruction.mockReset()
  })

  it("为 Skill 工作区与指令文件注册全部 channel", async () => {
    const { registerSkillHandlers } = await import("@/ipc/skillHandlers")
    registerSkillHandlers()

    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual(
      [...SKILL_HANDLER_CHANNELS].sort(),
    )
  })

  it("文件操作校验字符串参数并转发到 service", async () => {
    const { registerSkillHandlers } = await import("@/ipc/skillHandlers")
    registerSkillHandlers()

    expect(() => handlerFor(AGENT_CHANNELS.listSkillFiles)(undefined, "  ")).toThrow()

    handlerFor(AGENT_CHANNELS.writeSkillFile)(undefined, "/skill", "references/a.md", "content")
    expect(workspaceService.writeSkillFile).toHaveBeenCalledWith(
      "/skill",
      "references/a.md",
      "content",
    )

    handlerFor(AGENT_CHANNELS.moveSkillFile)(undefined, "/skill", "a.md", "b.md")
    expect(workspaceService.moveSkillFile).toHaveBeenCalledWith("/skill", "a.md", "b.md")

    await handlerFor(AGENT_CHANNELS.deleteSkillFile)(undefined, "/skill", "a.md")
    expect(workspaceService.deleteSkillFile).toHaveBeenCalledWith("/skill", "a.md")
  })

  it("importSkillFiles 取消选择返回空列表，选中时把路径交给 service", async () => {
    const { registerSkillHandlers } = await import("@/ipc/skillHandlers")
    registerSkillHandlers()
    const importHandler = handlerFor(AGENT_CHANNELS.importSkillFiles)

    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    expect(await importHandler(undefined, "/skill", "")).toEqual({ ok: true, files: [] })
    expect(workspaceService.importSkillFiles).not.toHaveBeenCalled()

    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ["/tmp/a.png"] })
    workspaceService.importSkillFiles.mockReturnValueOnce({ ok: true, files: ["assets/a.png"] })
    expect(await importHandler(undefined, "/skill", "assets", "Import Files")).toEqual({
      ok: true,
      files: ["assets/a.png"],
    })
    expect(showOpenDialog).toHaveBeenLastCalledWith({
      properties: ["openFile", "multiSelections"],
      title: "Import Files",
    })
    expect(workspaceService.importSkillFiles).toHaveBeenCalledWith("/skill", "assets", [
      "/tmp/a.png",
    ])
  })

  it("saveSkill 拒绝非对象输入并转发合法输入", async () => {
    const { registerSkillHandlers } = await import("@/ipc/skillHandlers")
    registerSkillHandlers()
    const saveHandler = handlerFor(AGENT_CHANNELS.saveSkill)

    expect(saveHandler(undefined, undefined)).toEqual({ ok: false, error: expect.any(String) })

    const input = { scope: "user", targetRoot: "lx", name: "x", description: "y" }
    saveHandler(undefined, input)
    expect(workspaceService.saveSkill).toHaveBeenCalledWith(input)
  })

  it("指令文件读写校验 scope 并转发", async () => {
    const { registerSkillHandlers } = await import("@/ipc/skillHandlers")
    registerSkillHandlers()
    const getHandler = handlerFor(AGENT_CHANNELS.getInstruction)
    const saveHandler = handlerFor(AGENT_CHANNELS.saveInstruction)

    expect(() => getHandler(undefined, "invalid")).toThrow()

    instructionService.getInstruction.mockReturnValueOnce({ scope: "user" })
    getHandler(undefined, "user", undefined)
    expect(instructionService.getInstruction).toHaveBeenCalledWith("user", undefined)

    instructionService.getInstruction.mockReturnValueOnce({ scope: "project" })
    getHandler(undefined, "project", "/proj")
    expect(instructionService.getInstruction).toHaveBeenCalledWith("project", "/proj")

    expect(() => saveHandler(undefined, null)).toThrow()
    instructionService.saveInstruction.mockReturnValueOnce({ scope: "user" })
    saveHandler(undefined, { scope: "user", content: "x" })
    expect(instructionService.saveInstruction).toHaveBeenCalledWith({ scope: "user", content: "x" })
  })
})
