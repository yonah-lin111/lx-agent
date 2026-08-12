// @vitest-environment jsdom

import type { Project, ProjectFolder, ProjectItem } from "@shared/project"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { projectApi } from "@/features/project/api/projectApi"
import { resolveRecentItemCards, useRecentItemsStore } from "@/features/project/recentItemsStore"

// 共享 store 与解析器依赖的 projectApi mock。
vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    listProjects: vi.fn(),
    listFolders: vi.fn(),
    list: vi.fn(),
  },
}))

const mockedApi = vi.mocked(projectApi)
const RECENT_ITEMS_KEY = "project-navigation-recent-items"

beforeEach(() => {
  localStorage.clear()
  useRecentItemsStore.setState({ ids: [] })
  mockedApi.listProjects.mockReset()
  mockedApi.listFolders.mockReset()
  mockedApi.list.mockReset()
})

describe("useRecentItemsStore", () => {
  it("push 按 MRU 记录到最前面并持久化", () => {
    useRecentItemsStore.setState({ ids: ["a"] })
    useRecentItemsStore.getState().push("b")
    expect(useRecentItemsStore.getState().ids).toEqual(["b", "a"])
    expect(JSON.parse(localStorage.getItem(RECENT_ITEMS_KEY) ?? "[]")).toEqual(["b", "a"])
  })

  it("push 已存在的 id 不重复且移到最前面", () => {
    useRecentItemsStore.setState({ ids: ["a", "b"] })
    useRecentItemsStore.getState().push("a")
    expect(useRecentItemsStore.getState().ids).toEqual(["a", "b"])
  })

  it("remove 移除指定条目并持久化", () => {
    useRecentItemsStore.setState({ ids: ["a", "b"] })
    useRecentItemsStore.getState().remove("a")
    expect(useRecentItemsStore.getState().ids).toEqual(["b"])
    expect(JSON.parse(localStorage.getItem(RECENT_ITEMS_KEY) ?? "[]")).toEqual(["b"])
  })

  it("move 将条目移动到目标位置并持久化", () => {
    useRecentItemsStore.setState({ ids: ["a", "b", "c"] })
    useRecentItemsStore.getState().move("a", "c")
    expect(useRecentItemsStore.getState().ids).toEqual(["b", "c", "a"])
    expect(JSON.parse(localStorage.getItem(RECENT_ITEMS_KEY) ?? "[]")).toEqual(["b", "c", "a"])
  })

  it("move 目标相同时不改变顺序", () => {
    useRecentItemsStore.setState({ ids: ["a", "b"] })
    useRecentItemsStore.getState().move("a", "a")
    expect(useRecentItemsStore.getState().ids).toEqual(["a", "b"])
  })

  it("clear 清空列表并持久化", () => {
    useRecentItemsStore.setState({ ids: ["a", "b"] })
    useRecentItemsStore.getState().clear()
    expect(useRecentItemsStore.getState().ids).toEqual([])
    expect(localStorage.getItem(RECENT_ITEMS_KEY)).toBe("[]")
  })

  it("setIds 相同时不写入、不同时写入", () => {
    useRecentItemsStore.setState({ ids: ["a", "b"] })
    useRecentItemsStore.getState().setIds(["a", "b"])
    expect(localStorage.getItem(RECENT_ITEMS_KEY)).toBeNull()
    useRecentItemsStore.getState().setIds(["c"])
    expect(JSON.parse(localStorage.getItem(RECENT_ITEMS_KEY) ?? "[]")).toEqual(["c"])
  })
})

describe("resolveRecentItemCards", () => {
  it("解析条目为卡片并忽略已删除条目", async () => {
    const projects: Project[] = [
      {
        id: "p1",
        name: "项目一",
        type: "virtual",
        referencedFolders: [],
        createdAt: "",
        updatedAt: "",
      },
    ]
    const folders: ProjectFolder[] = [
      { id: "f1", projectId: "p1", name: "文件夹一", createdAt: "", updatedAt: "" },
    ]
    const items: ProjectItem[] = [
      {
        id: "a",
        projectId: "p1",
        projectFolderId: "f1",
        name: "条目A",
        itemData: JSON.stringify([{ id: "page-1", name: "Page 1", content: "# 标题" }]),
        enabledFolderPaths: [],
        status: "todo",
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "b",
        projectId: "p1",
        name: "条目B",
        itemData: JSON.stringify([{ id: "page-1", name: "Page 1", content: "# 标题" }]),
        enabledFolderPaths: [],
        status: "completed",
        sortOrder: 1,
        createdAt: "",
        updatedAt: "",
      },
    ]
    mockedApi.listProjects.mockResolvedValue(projects)
    mockedApi.listFolders.mockResolvedValue(folders)
    mockedApi.list.mockResolvedValue(items)

    const { cards, validIds } = await resolveRecentItemCards(["a", "missing", "b"])
    expect(validIds).toEqual(["a", "b"])
    expect(cards).toEqual([
      {
        id: "a",
        itemName: "条目A",
        projectName: "项目一",
        folderName: "文件夹一",
        status: "todo",
        todo: 0,
        inProgress: 0,
        done: 0,
      },
      {
        id: "b",
        itemName: "条目B",
        projectName: "项目一",
        folderName: null,
        status: "completed",
        todo: 0,
        inProgress: 0,
        done: 0,
      },
    ])
  })
})
