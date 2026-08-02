import Database from "better-sqlite3"
import { afterEach, describe, expect, it } from "vitest"
import { createProjectTables } from "@/db"

// 测试使用的内存数据库。
let database: Database.Database | null = null

afterEach(() => {
  database?.close()
  database = null
})

describe("createProjectTables", () => {
  it("创建项目、文件夹与条目数据表与索引", () => {
    database = new Database(":memory:")

    createProjectTables(database)

    const tableNames = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name)
    const indexNames = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name)

    expect(tableNames).toEqual(["project", "project_folder", "project_item"])
    expect(indexNames).toEqual(
      expect.arrayContaining([
        "idx_project_item_folder_id",
        "idx_project_item_project_id",
        "idx_project_folder_project_id",
      ]),
    )
  })
})
