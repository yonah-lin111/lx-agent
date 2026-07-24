// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { projectNavigationApi } from "@/features/project-navigation/api/projectNavigationApi"
import { useProjectNavigationActions } from "@/features/project-navigation/hooks/useProjectNavigationActions"
import type { ProjectNavigationProject } from "@/features/project-navigation/types"

const projects: ProjectNavigationProject[] = [
  {
    id: "project-1",
    name: "LX Agent",
    modules: [],
    prompts: [{ id: "design-1", name: "Navigation", status: "todo" }],
  },
]

describe("useProjectNavigationActions", () => {
  afterEach(() => vi.restoreAllMocks())

  it("状态更新成功后刷新并提示成功", async () => {
    const refreshProjects = vi.fn<() => Promise<void>>().mockResolvedValue()
    const toast = { success: vi.fn(), error: vi.fn() }
    const updateDesign = vi.spyOn(projectNavigationApi, "updateDesign").mockResolvedValue()
    const { result } = renderHook(() =>
      useProjectNavigationActions(projects, refreshProjects, toast),
    )

    await act(() => result.current.updatePromptStatus("design-1", "completed"))

    expect(updateDesign).toHaveBeenCalledWith("design-1", { status: "completed" })
    expect(refreshProjects).toHaveBeenCalledOnce()
    expect(toast.success).toHaveBeenCalledWith("提示词状态更新成功")
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("状态更新失败时不刷新并提示失败", async () => {
    const refreshProjects = vi.fn<() => Promise<void>>().mockResolvedValue()
    const toast = { success: vi.fn(), error: vi.fn() }
    vi.spyOn(projectNavigationApi, "updateDesign").mockRejectedValue(new Error("IPC failed"))
    const { result } = renderHook(() =>
      useProjectNavigationActions(projects, refreshProjects, toast),
    )

    await act(() => result.current.updatePromptStatus("design-1", "completed"))

    expect(refreshProjects).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith("提示词状态更新失败")
    expect(toast.success).not.toHaveBeenCalled()
  })
})
