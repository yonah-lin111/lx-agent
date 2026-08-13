import { PROJECT_CHANNELS } from "@shared/ipc/projectChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke },
}))

describe("preload project API", () => {
  beforeEach(async () => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    await import("../../src/preload/index")
  })

  it("暴露项目 API 并转发参数到共享 channel", async () => {
    const api = exposeInMainWorld.mock.calls[0]?.[1]
    const input = { name: "LX Agent" }

    await api.project.projects.create(input)
    await api.project.projects.selectDirectory()
    await api.project.projects.searchFiles("project-1", "readme")
    await api.project.projects.searchReferencedFiles(["/tmp/reference"], "readme")

    expect(exposeInMainWorld).toHaveBeenCalledWith("api", expect.any(Object))
    expect(invoke).toHaveBeenNthCalledWith(1, PROJECT_CHANNELS.createProject, input)
    expect(invoke).toHaveBeenNthCalledWith(2, PROJECT_CHANNELS.selectProjectDirectory)
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      PROJECT_CHANNELS.searchProjectFiles,
      "project-1",
      "readme",
    )
    expect(invoke).toHaveBeenNthCalledWith(
      4,
      PROJECT_CHANNELS.searchReferencedProjectFiles,
      ["/tmp/reference"],
      "readme",
    )
  })
})
