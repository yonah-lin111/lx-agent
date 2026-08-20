// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { projectApi } from "@/features/project/api/projectApi"
import { ProjectReferencedFolderTags } from "@/features/project/components/ProjectReferencedFolderTags"
import { useProjectReferencedFoldersStore } from "@/features/project/referencedFoldersStore"

// Mock ResizeObserver for jsdom environment.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

let mockSearchParams = new URLSearchParams()

vi.mock("react-router-dom", () => ({
  useSearchParams: () => [mockSearchParams],
  useInRouterContext: () => true,
}))

vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    listProjects: vi.fn(),
    list: vi.fn(),
    selectDirectory: vi.fn(),
    updateProject: vi.fn(),
    update: vi.fn(),
  },
}))

const mockedApi = vi.mocked(projectApi)

describe("ProjectReferencedFolderTags Component", () => {
  beforeEach(() => {
    useProjectReferencedFoldersStore.setState({
      foldersByProjectId: {},
      enabledPathsByItemId: {},
    })
    mockedApi.listProjects.mockReset()
    mockedApi.list.mockReset()
    mockSearchParams = new URLSearchParams()
  })

  afterEach(cleanup)

  it("当没有选中 itemId 时渲染基础容器", async () => {
    await act(async () => {
      render(<ProjectReferencedFolderTags />)
    })
    expect(screen.getByLabelText("Add Folder")).not.toBeNull()
  })

  it("当有 itemId 且有引用文件夹时正确渲染文件夹标签", async () => {
    mockSearchParams = new URLSearchParams("itemId=item-1")
    useProjectReferencedFoldersStore.setState({
      foldersByProjectId: {
        p1: [
          {
            path: "/path/to/my-folder",
            createdAt: new Date().toISOString(),
          },
        ],
      },
      enabledPathsByItemId: {
        "item-1": ["/path/to/my-folder"],
      },
    })

    mockedApi.list.mockResolvedValue([
      {
        id: "item-1",
        projectId: "p1",
        name: "Item 1",
        itemData: "[]",
        enabledFolderPaths: ["/path/to/my-folder"],
        status: "todo",
        createdAt: "",
        updatedAt: "",
      },
    ])
    mockedApi.listProjects.mockResolvedValue([
      {
        id: "p1",
        name: "Project 1",
        type: "virtual",
        referencedFolders: [
          {
            path: "/path/to/my-folder",
            createdAt: new Date().toISOString(),
          },
        ],
        createdAt: "",
        updatedAt: "",
      },
    ])

    await act(async () => {
      render(<ProjectReferencedFolderTags />)
    })

    await waitFor(
      () => {
        expect(screen.getByText("my-folder")).not.toBeNull()
      },
      { timeout: 1000 },
    )
  })
})
