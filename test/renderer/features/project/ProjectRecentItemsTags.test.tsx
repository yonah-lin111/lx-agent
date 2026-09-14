// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
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

  it("左右滚动按钮使用 ArrowLeft/ArrowRight 图标", async () => {
    let container: HTMLElement
    await act(async () => {
      ;({ container } = render(<ProjectRecentItemsTags />))
    })
    expect(container!.querySelector(".lucide-arrow-left")).not.toBeNull()
    expect(container!.querySelector(".lucide-arrow-right")).not.toBeNull()
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

  // 渲染单个 todo 状态的最近条目，返回渲染后的容器。
  const renderSingleRecentItem = async (): Promise<HTMLElement> => {
    mockSearchParams = new URLSearchParams("itemId=item-1")
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

    let container: HTMLElement
    await act(async () => {
      ;({ container } = render(<ProjectRecentItemsTags />))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    return container!
  }

  it("最近打开芯片为 button，并保留状态色与高亮属性", async () => {
    await renderSingleRecentItem()

    const tag = document.querySelector(".project-recent-tag") as HTMLElement
    expect(tag).not.toBeNull()
    expect(tag.tagName).toBe("BUTTON")
    expect(tag.getAttribute("data-color")).toBe("default")
    expect(tag.getAttribute("data-highlighted")).toBe("true")
  })

  it("点击芯片关闭入口直接移除最近项，且不触发跳转导航", async () => {
    await renderSingleRecentItem()

    const tag = document.querySelector(".project-recent-tag") as HTMLElement
    const closeIcon = tag.querySelector('[role="button"]') as HTMLElement
    expect(closeIcon).not.toBeNull()

    fireEvent.click(closeIcon)

    expect(useRecentItemsStore.getState().ids).toEqual([])
    expect(document.querySelector(".project-recent-tag")).toBeNull()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("悬停详情中的状态徽标只使用预设字号 text-xs", async () => {
    mockSearchParams = new URLSearchParams("itemId=item-1")
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
    mockedApi.listFolders.mockResolvedValue([])
    mockedApi.list.mockResolvedValue([
      {
        id: "item-1",
        projectId: "p1",
        name: "Item C",
        itemData: JSON.stringify([
          {
            id: "page-1",
            name: "Page 1",
            content: "&&& TaskA\n&&& done\n&&& TaskB\n&&& in_progress\n&&& TaskC\n&&& --end",
          },
        ]),
        enabledFolderPaths: [],
        status: "todo",
        createdAt: "",
        updatedAt: "",
      },
    ])

    let container: HTMLElement
    await act(async () => {
      ;({ container } = render(<ProjectRecentItemsTags />))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    const tag = container!.querySelector(".project-recent-tag") as HTMLElement
    expect(tag).not.toBeNull()
    fireEvent.mouseEnter(tag.parentElement as HTMLElement)

    // 悬停气泡 150ms 延迟后挂载，等待后校验徽标字号。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200))
    })

    const tooltip = document.querySelector('[role="tooltip"]')
    expect(tooltip).not.toBeNull()
    for (const label of ["待办 1", "进行中 1", "已完成 1"]) {
      const badge = tooltip!.querySelector(`[aria-label="${label}"]`) as HTMLElement
      expect(badge).not.toBeNull()
      expect(badge.className).toContain("text-xs")
      expect(badge.className).not.toContain("text-[10px]")
    }
  })
})
