import { PROJECT_CHANNELS } from "@shared/ipc/projectChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.fn()

vi.mock("electron", () => ({ ipcMain: { handle } }))
vi.mock("@/services/projectService", () => ({
  projectService: {
    listProjects: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
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
})
