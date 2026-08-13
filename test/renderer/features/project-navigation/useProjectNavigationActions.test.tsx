// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { projectNavigationApi } from "@/features/project-navigation/api/projectNavigationApi"
import { useProjectNavigationActions } from "@/features/project-navigation/hooks/useProjectNavigationActions"
import { useProjectItemsVersionStore } from "@/features/project-navigation/projectItemsStore"
import type { ProjectNavigationProject } from "@/features/project-navigation/types"

const projects: ProjectNavigationProject[] = [
  {
    id: "project-1",
    name: "LX Agent",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    projectFolders: [],
    prompts: [
      {
        id: "item-1",
        name: "Navigation",
        status: "todo",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  },
]

describe("useProjectNavigationActions", () => {
  afterEach(() => vi.restoreAllMocks())

  it("状态更新成功后刷新并提示成功", async () => {
    const refreshProjects = vi.fn<() => Promise<void>>().mockResolvedValue()
    const toast = { success: vi.fn(), error: vi.fn() }
    const updateItem = vi.spyOn(projectNavigationApi, "updateItem").mockResolvedValue()
    const { result } = renderHook(() =>
      useProjectNavigationActions(projects, refreshProjects, toast),
    )

    const versionBefore = useProjectItemsVersionStore.getState().version
    await act(() => result.current.updatePromptStatus("item-1", "completed"))

    expect(updateItem).toHaveBeenCalledWith("item-1", { status: "completed" })
    expect(refreshProjects).toHaveBeenCalledOnce()
    expect(useProjectItemsVersionStore.getState().version).toBe(versionBefore + 1)
    expect(toast.success).toHaveBeenCalledWith("条目状态更新成功")
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("状态更新失败时不刷新并提示失败", async () => {
    const refreshProjects = vi.fn<() => Promise<void>>().mockResolvedValue()
    const toast = { success: vi.fn(), error: vi.fn() }
    vi.spyOn(projectNavigationApi, "updateItem").mockRejectedValue(new Error("IPC failed"))
    const { result } = renderHook(() =>
      useProjectNavigationActions(projects, refreshProjects, toast),
    )

    await act(() => result.current.updatePromptStatus("item-1", "completed"))

    expect(refreshProjects).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith("条目状态更新失败")
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("选择目录后使用目录名创建文件系统项目", async () => {
    const refreshProjects = vi.fn<() => Promise<void>>().mockResolvedValue()
    const toast = { success: vi.fn(), error: vi.fn() }
    vi.spyOn(projectNavigationApi, "selectProjectDirectory").mockResolvedValue("/tmp/LX Agent")
    const createProject = vi.spyOn(projectNavigationApi, "createProject").mockResolvedValue({
      id: "project-2",
      name: "LX Agent",
      type: "filesystem",
      referencedFolders: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })
    const { result } = renderHook(() =>
      useProjectNavigationActions(projects, refreshProjects, toast),
    )

    await expect(act(() => result.current.importProject())).resolves.toBe("project-2")

    expect(createProject).toHaveBeenCalledWith({
      name: "LX Agent",
      path: "/tmp/LX Agent",
      type: "filesystem",
    })
    expect(refreshProjects).toHaveBeenCalledOnce()
  })
})
