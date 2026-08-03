import type { Project, ProjectFolder, ProjectItem } from "@shared/project"
import { describe, expect, it } from "vitest"
import { getSortedPromptIds } from "@/features/project-navigation/hooks/useProjectNavigationActions"
import {
  createProjectNavigationTree,
  filterProjectNavigationTree,
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

const items: ProjectItem[] = [
  {
    id: "item-1",
    projectId: project.id,
    projectFolderId: folder.id,
    name: "Navigation",
    itemData: "",
    enabledFolderPaths: [],
    status: "todo",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "item-2",
    projectId: project.id,
    name: "Project setup",
    itemData: "",
    enabledFolderPaths: [],
    status: "completed",
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
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

  it("按状态稳定排序条目", () => {
    expect(getSortedPromptIds(createProjectNavigationTree([project], [folder], items))).toEqual([
      "item-1",
      "item-2",
    ])
  })
})
