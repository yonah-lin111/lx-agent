import type { Design, Module, Project } from "@shared/project"
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
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const module: Module = {
  id: "module-1",
  projectId: project.id,
  name: "Frontend",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const designs: Design[] = [
  {
    id: "design-1",
    projectId: project.id,
    moduleId: module.id,
    name: "Navigation",
    designData: "",
    status: "todo",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "design-2",
    projectId: project.id,
    name: "Project setup",
    designData: "",
    status: "completed",
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]

describe("project navigation utils", () => {
  it("组装模块与直属设计", () => {
    expect(createProjectNavigationTree([project], [module], designs)).toMatchObject([
      { modules: [{ prompts: [{ id: "design-1" }] }], prompts: [{ id: "design-2" }] },
    ])
  })

  it("搜索命中子节点时保留项目与模块", () => {
    const tree = createProjectNavigationTree([project], [module], designs)
    expect(filterProjectNavigationTree(tree, "navigation")).toMatchObject([
      { id: project.id, modules: [{ id: module.id, prompts: [{ id: "design-1" }] }], prompts: [] },
    ])
  })

  it("按状态稳定排序提示词", () => {
    expect(getSortedPromptIds(createProjectNavigationTree([project], [module], designs))).toEqual([
      "design-1",
      "design-2",
    ])
  })
})
