import { PROJECT_CHANNELS } from "@shared/ipc/projectChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.fn()
const showOpenDialog = vi.fn()

vi.mock("electron", () => ({ dialog: { showOpenDialog }, ipcMain: { handle } }))
vi.mock("@/services/projectService", () => ({
  projectService: {
    listProjects: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    searchProjectFiles: vi.fn(),
    listModules: vi.fn(),
    createModule: vi.fn(),
    updateModule: vi.fn(),
    deleteModule: vi.fn(),
    listDesigns: vi.fn(),
    createDesign: vi.fn(),
    updateDesign: vi.fn(),
    sortDesigns: vi.fn(),
    deleteDesign: vi.fn(),
  },
}))

describe("project IPC handlers", () => {
  beforeEach(() => handle.mockClear())

  it("为共享项目 channel 注册所有 handler", async () => {
    const { registerProjectHandlers } = await import("@/ipc/projectHandlers")

    registerProjectHandlers()

    expect(handle).toHaveBeenCalledTimes(Object.keys(PROJECT_CHANNELS).length)
    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual(
      Object.values(PROJECT_CHANNELS).sort(),
    )
  })

  it("校验并转发项目文件搜索参数", async () => {
    const { projectService } = await import("@/services/projectService")
    const { registerProjectHandlers } = await import("@/ipc/projectHandlers")
    const searchHandler = vi.fn()
    handle.mockImplementation((channel, handler) => {
      if (channel === PROJECT_CHANNELS.searchProjectFiles) searchHandler.mockImplementation(handler)
    })

    registerProjectHandlers()

    searchHandler({}, "project-1", "readme")
    expect(projectService.searchProjectFiles).toHaveBeenCalledWith("project-1", "readme")
    expect(() => searchHandler({}, "project-1", 1)).toThrow("INVALID_PROJECT_FILE_SEARCH_INPUT")
  })

  it("打开目录选择器并返回所选路径", async () => {
    const { registerProjectHandlers } = await import("@/ipc/projectHandlers")
    const selectDirectoryHandler = vi.fn()
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/tmp/LX Agent"] })
    handle.mockImplementation((channel, handler) => {
      if (channel === PROJECT_CHANNELS.selectProjectDirectory) {
        selectDirectoryHandler.mockImplementation(handler)
      }
    })

    registerProjectHandlers()

    await expect(selectDirectoryHandler()).resolves.toBe("/tmp/LX Agent")
    expect(showOpenDialog).toHaveBeenCalledWith({
      properties: ["openDirectory"],
      title: "选择项目文件夹",
    })
  })
})
