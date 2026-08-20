import type { Project, ProjectFolder, ProjectItem } from "@shared/project"
import { describe, expect, it } from "vitest"
import {
  createProjectNavigationTree,
  filterProjectNavigationTree,
  sortProjectNavigationTree,
} from "@/features/project-navigation/utils"

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
  name: "Frontend",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const makeItem = (
  overrides: Partial<ProjectItem> & Pick<ProjectItem, "id" | "name">,
): ProjectItem => ({
  projectId: project.id,
  projectFolderId: folder.id,
  itemData: "",
  enabledFolderPaths: [],
  status: "todo",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
})

const items: ProjectItem[] = [
  makeItem({ id: "item-1", name: "Navigation" }),
  makeItem({
    id: "item-2",
    name: "Project setup",
    projectFolderId: undefined,
    status: "completed",
  }),
]

describe("project navigation utils", () => {
  it("组装文件夹与直属条目", () => {
    expect(createProjectNavigationTree([project], [folder], items)).toMatchObject([
      {
        projectFolders: [{ prompts: [{ id: "item-1" }] }],
        prompts: [{ id: "item-2" }],
      },
    ])
  })

  it("组装多层嵌套文件夹与条目", () => {
    const subFolder: ProjectFolder = {
      id: "subfolder-1",
      projectId: project.id,
      parentFolderId: folder.id,
      name: "Components",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }
    const deepItem = makeItem({
      id: "item-deep",
      name: "Nested Prompt",
      projectFolderId: subFolder.id,
    })

    const tree = createProjectNavigationTree([project], [folder, subFolder], [deepItem])
    expect(tree).toMatchObject([
      {
        projectFolders: [
          {
            id: folder.id,
            projectFolders: [
              {
                id: subFolder.id,
                prompts: [{ id: "item-deep" }],
              },
            ],
          },
        ],
      },
    ])
  })

  it("搜索命中子节点时保留项目与文件夹", () => {
    const tree = createProjectNavigationTree([project], [folder], items)
    expect(filterProjectNavigationTree(tree, "navigation")).toMatchObject([
      {
        id: project.id,
        projectFolders: [{ id: folder.id, prompts: [{ id: "item-1" }] }],
        prompts: [],
      },
    ])
  })

  describe("sortProjectNavigationTree", () => {
    it("按首字母升序排序且已完成置底", () => {
      const tree = createProjectNavigationTree(
        [project],
        [folder],
        [
          makeItem({ id: "zebra", name: "Zebra", status: "todo" }),
          makeItem({ id: "alpha", name: "Alpha", status: "completed" }),
          makeItem({ id: "mid", name: "Mid", status: "in_progress" }),
        ],
      )
      const [result] = sortProjectNavigationTree(tree, "name", "asc")
      expect(result.projectFolders[0].prompts.map((prompt) => prompt.id)).toEqual([
        "mid",
        "zebra",
        "alpha",
      ])
    })

    it("按创建时间升序排序", () => {
      const tree = createProjectNavigationTree(
        [project],
        [folder],
        [
          makeItem({ id: "new", name: "New", createdAt: "2026-03-01T00:00:00.000Z" }),
          makeItem({ id: "old", name: "Old", createdAt: "2026-01-01T00:00:00.000Z" }),
        ],
      )
      const [result] = sortProjectNavigationTree(tree, "createdAt", "asc")
      expect(result.projectFolders[0].prompts.map((prompt) => prompt.id)).toEqual(["old", "new"])
    })

    it("按修改时间降序排序", () => {
      const tree = createProjectNavigationTree(
        [project],
        [folder],
        [
          makeItem({ id: "stale", name: "Stale", updatedAt: "2026-01-01T00:00:00.000Z" }),
          makeItem({ id: "fresh", name: "Fresh", updatedAt: "2026-03-01T00:00:00.000Z" }),
        ],
      )
      const [result] = sortProjectNavigationTree(tree, "updatedAt", "desc")
      expect(result.projectFolders[0].prompts.map((prompt) => prompt.id)).toEqual([
        "fresh",
        "stale",
      ])
    })

    it("按名称排序项目与文件夹", () => {
      const otherProject: Project = {
        ...project,
        id: "project-2",
        name: "Aardvark",
      }
      const tree = createProjectNavigationTree([project, otherProject], [folder], [])
      const result = sortProjectNavigationTree(tree, "name", "asc")
      expect(result.map((current) => current.id)).toEqual(["project-2", "project-1"])
    })
  })
})
