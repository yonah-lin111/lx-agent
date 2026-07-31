import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createDesignTables } from "@/db"
import { migrateProjectReferencedFolders } from "@/db/migrations/001_add_project_referenced_folders"
import { migrateProjectReferencedFolderTimestamps } from "@/db/migrations/002_add_project_referenced_folder_timestamps"
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

  it("升级时回填设计中的文件夹引用", () => {
    const legacyDatabase = new Database(":memory:")
    legacyDatabase.exec(`
      CREATE TABLE project (external_id TEXT PRIMARY KEY);
      CREATE TABLE design (id INTEGER PRIMARY KEY, project_id TEXT NOT NULL, design_data TEXT);
    `)
    legacyDatabase.prepare("INSERT INTO project (external_id) VALUES (?)").run("project-1")
    legacyDatabase
      .prepare("INSERT INTO design (project_id, design_data) VALUES (?, ?)")
      .run(
        "project-1",
        "@[refer-folder](/tmp/docs) @[refer-folder](/tmp/docs) @[refer-folder](/tmp/src) @[refer-folder](/tmp/(legacy))",
      )

    migrateProjectReferencedFolders(legacyDatabase)
    migrateProjectReferencedFolderTimestamps(legacyDatabase)

    const row = legacyDatabase
      .prepare("SELECT referenced_folders FROM project WHERE external_id = ?")
      .get("project-1") as { referenced_folders: string }
    expect(JSON.parse(row.referenced_folders)).toEqual([
      { path: "/tmp/docs", createdAt: expect.any(String) },
      { path: "/tmp/src", createdAt: expect.any(String) },
      { path: "/tmp/(legacy)", createdAt: expect.any(String) },
    ])
    legacyDatabase.close()
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

    service.updateProject(project.id, {
      name: "LX Agent Next",
      path: "",
      referencedFolders: [
        { path: "/tmp/docs", createdAt: "2026-01-01T00:00:00.000Z" },
        { path: "/tmp/docs", createdAt: "2026-01-02T00:00:00.000Z" },
        { path: " /tmp/src ", createdAt: "2026-01-03T00:00:00.000Z" },
      ],
    })
    service.updateModule(module.id, { name: "Engineering" })
    service.updateDesign(design.id, { name: "Build plan", status: "in_progress" })

    expect(service.listProjects()[0]).toMatchObject({
      name: "LX Agent Next",
      path: undefined,
      referencedFolders: [
        { path: "/tmp/docs", createdAt: "2026-01-02T00:00:00.000Z" },
        { path: "/tmp/src", createdAt: "2026-01-03T00:00:00.000Z" },
      ],
    })
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
