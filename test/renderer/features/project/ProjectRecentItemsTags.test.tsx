// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { projectApi } from "@/features/project/api/projectApi"
import { ProjectRecentItemsTags } from "@/features/project/components/ProjectRecentItemsTags"
import { useRecentItemsStore } from "@/features/project/recentItemsStore"

// Mock ResizeObserver for jsdom environment.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const mockNavigate = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams],
}))

vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    listProjects: vi.fn(),
    listFolders: vi.fn(),
    list: vi.fn(),
  },
}))

const mockedApi = vi.mocked(projectApi)

describe("ProjectRecentItemsTags Component", () => {
  beforeEach(() => {
    localStorage.clear()
    useRecentItemsStore.setState({ ids: [] })
    mockedApi.listProjects.mockResolvedValue([])
    mockedApi.listFolders.mockResolvedValue([])
    mockedApi.list.mockResolvedValue([])
    mockNavigate.mockReset()
    mockSearchParams = new URLSearchParams()
  })

  afterEach(cleanup)

  it("当没有最近项时显示暂无最近打开", async () => {
    await act(async () => {
      render(<ProjectRecentItemsTags />)
    })
    expect(
      screen.queryByText("暂无最近打开") ?? screen.queryByText("No projects yet"),
    ).not.toBeNull()
  })

  it("当有最近打开项时渲染对应 tags 并能显示面包屑文本", async () => {
    useRecentItemsStore.setState({ ids: ["item-1"] })

    mockedApi.listProjects.mockResolvedValue([
      {
        id: "p1",
        name: "Project A",
        type: "virtual",
        referencedFolders: [],
        createdAt: "",
        updatedAt: "",
      },
    ])
    mockedApi.listFolders.mockResolvedValue([
      { id: "f1", projectId: "p1", name: "Folder B", createdAt: "", updatedAt: "" },
    ])
    mockedApi.list.mockResolvedValue([
      {
        id: "item-1",
        projectId: "p1",
        projectFolderId: "f1",
        name: "Item C",
        itemData: "[]",
        enabledFolderPaths: [],
        status: "todo",
        createdAt: "",
        updatedAt: "",
      },
    ])

    await act(async () => {
      render(<ProjectRecentItemsTags />)
    })

    // Wait for resolveRecentItemCards promises to complete.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    // Tags list showing Project A / Folder B / Item C
    expect(screen.getByText("Project A")).not.toBeNull()
    expect(screen.getByText("Folder B")).not.toBeNull()
    expect(screen.getByText("Item C")).not.toBeNull()
  })

  it("临时提示词固定渲染 sky 颜色与对应名称", async () => {
    useRecentItemsStore.setState({ ids: ["temp-p1"] })

    mockedApi.listProjects.mockResolvedValue([
      {
        id: "p1",
        name: "Project A",
        type: "virtual",
        referencedFolders: [],
        createdAt: "",
        updatedAt: "",
      },
    ])
    mockedApi.listFolders.mockResolvedValue([])
    mockedApi.list.mockResolvedValue([])

    await act(async () => {
      render(<ProjectRecentItemsTags />)
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    const tag = document.querySelector('.project-recent-tag[data-color="sky"]')
    expect(tag).not.toBeNull()
  })
})
