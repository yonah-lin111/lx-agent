// @vitest-environment jsdom

import type { Project, ProjectFolder, ProjectItem } from "@shared/project"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { projectApi } from "@/features/project/api/projectApi"
import { PAGE_ROUTES } from "@/lib/pageRoutes"
import { ProjectRecentItemsTabs } from "@/pages/project/components/ProjectRecentItemsTabs"

// localStorage 中保存最近打开条目 id 列表的键（与组件保持一致）。
const RECENT_ITEMS_KEY = "project-navigation-recent-items"

// 模板块结束行的合法 32 位十六进制 id。
const BLOCK_ID = "a".repeat(32)

const project: Project = {
  id: "project-1",
  name: "LX Agent",
  type: "virtual",
  referencedFolders: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const folder: ProjectFolder = {
  id: "folder-1",
  projectId: project.id,
  name: "需求",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const item: ProjectItem = {
  id: "item-1",
  projectId: project.id,
  projectFolderId: folder.id,
  name: "新增需求",
  itemData: JSON.stringify([
    {
      id: "page-1",
      name: "Page 1",
      content: `&&& addTemplate\n内容\n&&& in_progress {id:${BLOCK_ID}}\n&&& bugTemplate\n内容\n&&& done {id:${BLOCK_ID}}\n`,
    },
  ]),
  enabledFolderPaths: [],
  status: "todo",
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

// jsdom 未实现 ResizeObserver，用空实现代替。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const renderTabs = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={["/project"]}>
      <Routes>
        <Route path={PAGE_ROUTES.project} element={<ProjectRecentItemsTabs isExpanded />} />
      </Routes>
    </MemoryRouter>,
  )

describe("ProjectRecentItemsTabs", () => {
  beforeEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("展开且无最近条目时显示空态", async () => {
    vi.spyOn(projectApi, "listProjects").mockResolvedValue([])
    vi.spyOn(projectApi, "listFolders").mockResolvedValue([])
    vi.spyOn(projectApi, "list").mockResolvedValue([])

    renderTabs()

    expect(await screen.findByText("暂无最近条目")).toBeDefined()
  })

  it("展开且存在最近条目时渲染卡片与计数徽章", async () => {
    localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify([item.id]))
    vi.spyOn(projectApi, "listProjects").mockResolvedValue([project])
    vi.spyOn(projectApi, "listFolders").mockResolvedValue([folder])
    vi.spyOn(projectApi, "list").mockResolvedValue([item])

    renderTabs()

    expect(await screen.findByText("新增需求")).toBeDefined()
    expect(screen.getByLabelText("进行中 1")).toBeDefined()
    expect(screen.getByLabelText("已完成 1")).toBeDefined()
    expect(screen.getByText("LX Agent / 需求")).toBeDefined()
  })

  it("折叠时不渲染最近条目列表", () => {
    localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify([item.id]))
    vi.spyOn(projectApi, "listProjects").mockResolvedValue([project])
    vi.spyOn(projectApi, "listFolders").mockResolvedValue([folder])
    vi.spyOn(projectApi, "list").mockResolvedValue([item])

    render(
      <MemoryRouter initialEntries={["/project"]}>
        <Routes>
          <Route
            path={PAGE_ROUTES.project}
            element={<ProjectRecentItemsTabs isExpanded={false} />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByText("新增需求")).toBeNull()
  })

  it("点击卡片切换到对应条目", async () => {
    localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify([item.id]))
    vi.spyOn(projectApi, "listProjects").mockResolvedValue([project])
    vi.spyOn(projectApi, "listFolders").mockResolvedValue([folder])
    vi.spyOn(projectApi, "list").mockResolvedValue([item])

    renderTabs()

    fireEvent.click(await screen.findByText("新增需求"))

    expect(await screen.findByRole("button", { current: "page" })).toBeDefined()
  })

  it("点击移除按钮后卡片与本地记录同步清除", async () => {
    localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify([item.id]))
    vi.spyOn(projectApi, "listProjects").mockResolvedValue([project])
    vi.spyOn(projectApi, "listFolders").mockResolvedValue([folder])
    vi.spyOn(projectApi, "list").mockResolvedValue([item])

    renderTabs()

    await screen.findByText("新增需求")
    fireEvent.click(screen.getByLabelText("从最近列表移除"))

    expect(screen.queryByText("新增需求")).toBeNull()
    expect(localStorage.getItem(RECENT_ITEMS_KEY)).toBe("[]")
  })
})
