// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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

  it("根容器不使用 overflow-hidden，标签上下边框不被裁剪", async () => {
    let container: HTMLElement
    await act(async () => {
      ;({ container } = render(<ProjectReferencedFolderTags />))
    })
    const root = container!.firstElementChild as HTMLElement
    expect(root.classList.contains("overflow-hidden")).toBe(false)
  })

  it("左右滚动按钮使用 ArrowLeft/ArrowRight 图标", async () => {
    let container: HTMLElement
    await act(async () => {
      ;({ container } = render(<ProjectReferencedFolderTags />))
    })
    expect(container!.querySelector(".lucide-arrow-left")).not.toBeNull()
    expect(container!.querySelector(".lucide-arrow-right")).not.toBeNull()
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
    expect(document.querySelector(".project-referenced-tag")).not.toBeNull()
  })

  // 渲染带单个已启用引用文件夹的标签栏，返回容器。
  const renderReferencedFolder = async (): Promise<HTMLElement> => {
    mockSearchParams = new URLSearchParams("itemId=item-1")
    useProjectReferencedFoldersStore.setState({
      foldersByProjectId: {
        p1: [{ path: "/path/to/my-folder", createdAt: new Date().toISOString() }],
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
    mockedApi.updateProject.mockResolvedValue(undefined as never)
    mockedApi.update.mockResolvedValue(undefined as never)

    let container: HTMLElement
    await act(async () => {
      ;({ container } = render(<ProjectReferencedFolderTags />))
    })
    await waitFor(
      () => {
        expect(screen.getByText("my-folder")).not.toBeNull()
      },
      { timeout: 1000 },
    )
    return container!
  }

  it("引用文件夹芯片为 button，关闭需二次确认，确认后移除引用", async () => {
    const container = await renderReferencedFolder()
    const tag = container.querySelector(".project-referenced-tag") as HTMLElement
    expect(tag.tagName).toBe("BUTTON")

    fireEvent.click(tag.querySelector('[aria-label="Close"]') as HTMLElement)
    expect(mockedApi.updateProject).not.toHaveBeenCalled()
    expect(screen.getByText("Are you sure you want to delete this folder?")).not.toBeNull()

    fireEvent.click(screen.getByLabelText("Confirm"))
    await act(async () => undefined)
    expect(mockedApi.updateProject).toHaveBeenCalledWith("p1", { referencedFolders: [] })
    expect(useProjectReferencedFoldersStore.getState().foldersByProjectId.p1).toEqual([])
  })

  it("点击 Pin 图标切换条目启用状态并持久化", async () => {
    const container = await renderReferencedFolder()
    const tag = container.querySelector(".project-referenced-tag") as HTMLElement
    const pin = tag.querySelector('[aria-label="Disable this folder in @ mentions"]') as HTMLElement
    expect(pin).not.toBeNull()

    fireEvent.click(pin)

    expect(useProjectReferencedFoldersStore.getState().enabledPathsByItemId["item-1"]).toEqual([])
    expect(mockedApi.update).toHaveBeenCalledWith("item-1", { enabledFolderPaths: [] })
  })

  it("点击复制图标写入文件夹引用并切换为已复制图标", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    })

    const container = await renderReferencedFolder()
    const tag = container.querySelector(".project-referenced-tag") as HTMLElement
    fireEvent.click(tag.querySelector('[aria-label="Copy folder reference"]') as HTMLElement)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1)
    })
    expect(tag.querySelector(".lucide-check")).not.toBeNull()
  })
})
