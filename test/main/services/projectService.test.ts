import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createProjectTables } from "@/db"
import { getProjectFileMatchScore } from "@/lib/fileSystem"
import { createProjectService } from "@/services/projectService"

// 测试使用的内存数据库。
let database: Database.Database

beforeEach(() => {
  database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  createProjectTables(database)
})

afterEach(() => {
  database.close()
})

describe("projectService", () => {
  it("支持完整路径的子序列模糊匹配", () => {
    expect(
      getProjectFileMatchScore("src/renderer/src/pages/settings/index.tsx", "setind"),
    ).toBeGreaterThan(0)
  })

  it("支持项目、文件夹和条目的 CRUD", () => {
    const service = createProjectService(() => database)
    const project = service.createProject({ name: "LX Agent", path: "/tmp" })
    const folder = service.createFolder({ projectId: project.id, name: "Product" })
    const item = service.createItem({
      projectId: project.id,
      projectFolderId: folder.id,
      name: "Plan",
    })

    service.updateProject(project.id, {
      name: "LX Agent Next",
      path: "",
      referencedFolders: [
        { path: "/tmp/docs", createdAt: "2026-01-01T00:00:00.000Z" },
        { path: "/tmp/docs", createdAt: "2026-01-02T00:00:00.000Z" },
        { path: " /tmp/src ", createdAt: "2026-01-03T00:00:00.000Z" },
      ],
    })
    service.updateFolder(folder.id, { name: "Engineering" })
    service.updateItem(item.id, {
      name: "Build plan",
      status: "in_progress",
      enabledFolderPaths: ["/tmp/docs", "/tmp/docs", " /tmp/src "],
    })

    expect(service.listProjects()[0]).toMatchObject({
      name: "LX Agent Next",
      path: undefined,
      referencedFolders: [
        { path: "/tmp/docs", createdAt: "2026-01-02T00:00:00.000Z" },
        { path: "/tmp/src", createdAt: "2026-01-03T00:00:00.000Z" },
      ],
    })
    expect(service.listFolders(project.id)[0]?.name).toBe("Engineering")
    expect(service.listItems(project.id)[0]).toMatchObject({
      name: "Build plan",
      status: "in_progress",
      enabledFolderPaths: ["/tmp/docs", "/tmp/src"],
    })

    service.deleteItem(item.id)
    expect(service.listItems(project.id)).toEqual([])
  })

  it("条目工作区绑定可写可读，null 解除绑定", () => {
    const service = createProjectService(() => database)
    const project = service.createProject({ name: "Git", path: "/tmp" })
    const item = service.createItem({ projectId: project.id, name: "Plan" })
    expect(item.worktreePath).toBeUndefined()

    service.updateItem(item.id, { worktreePath: "/tmp/.worktrees/feature-x" })
    expect(service.listItems(project.id)[0]?.worktreePath).toBe("/tmp/.worktrees/feature-x")

    service.updateItem(item.id, { worktreePath: null })
    expect(service.listItems(project.id)[0]?.worktreePath).toBeUndefined()
  })

  it("删除项目或文件夹时级联删除下属条目", () => {
    const service = createProjectService(() => database)
    const project = service.createProject({ name: "First" })
    const folder = service.createFolder({ projectId: project.id, name: "Module" })
    service.createItem({ projectId: project.id, projectFolderId: folder.id, name: "Nested" })
    service.createItem({ projectId: project.id, name: "Direct" })

    service.deleteFolder(folder.id)
    expect(service.listItems(project.id).map((item) => item.name)).toEqual(["Direct"])

    service.deleteProject(project.id)
    expect(service.listProjects()).toEqual([])
    expect(service.listFolders()).toEqual([])
    expect(service.listItems()).toEqual([])
  })

  it("拒绝不存在的项目路径", () => {
    const service = createProjectService(() => database)

    expect(() =>
      service.createProject({ name: "Missing", path: "/path/that/does-not-exist" }),
    ).toThrow("PROJECT_PATH_NOT_FOUND")
  })
})
