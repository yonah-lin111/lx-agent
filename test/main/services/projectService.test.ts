import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createDesignTables } from "@/db"
import { getProjectFileMatchScore } from "@/lib/fileSystem"
import { createProjectService } from "@/services/projectService"

// 测试使用的内存数据库。
let database: Database.Database

beforeEach(() => {
  database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  createDesignTables(database)
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

  it("支持项目、模块和设计的 CRUD", () => {
    const service = createProjectService(() => database)
    const project = service.createProject({ name: "LX Agent", path: "/tmp" })
    const module = service.createModule({ projectId: project.id, name: "Product" })
    const design = service.createDesign({
      projectId: project.id,
      moduleId: module.id,
      name: "Plan",
    })

    service.updateProject(project.id, { name: "LX Agent Next", path: "" })
    service.updateModule(module.id, { name: "Engineering" })
    service.updateDesign(design.id, { name: "Build plan", status: "in_progress" })

    expect(service.listProjects()[0]).toMatchObject({ name: "LX Agent Next", path: undefined })
    expect(service.listModules(project.id)[0]?.name).toBe("Engineering")
    expect(service.listDesigns(project.id)[0]).toMatchObject({
      name: "Build plan",
      status: "in_progress",
    })

    service.deleteDesign(design.id)
    expect(service.listDesigns(project.id)).toEqual([])
  })

  it("删除项目或模块时级联删除下属设计", () => {
    const service = createProjectService(() => database)
    const project = service.createProject({ name: "First" })
    const module = service.createModule({ projectId: project.id, name: "Module" })
    service.createDesign({ projectId: project.id, moduleId: module.id, name: "Nested" })
    service.createDesign({ projectId: project.id, name: "Direct" })

    service.deleteModule(module.id)
    expect(service.listDesigns(project.id).map((design) => design.name)).toEqual(["Direct"])

    service.deleteProject(project.id)
    expect(service.listProjects()).toEqual([])
    expect(service.listModules()).toEqual([])
    expect(service.listDesigns()).toEqual([])
  })

  it("拒绝不存在的项目路径", () => {
    const service = createProjectService(() => database)

    expect(() =>
      service.createProject({ name: "Missing", path: "/path/that/does-not-exist" }),
    ).toThrow("PROJECT_PATH_NOT_FOUND")
  })
})
