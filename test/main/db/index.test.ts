import Database from "better-sqlite3"
import { afterEach, describe, expect, it } from "vitest"
import { createDesignTables } from "@/db"

// 测试使用的内存数据库。
let database: Database.Database | null = null

afterEach(() => {
  database?.close()
  database = null
})

describe("createDesignTables", () => {
  it("创建去除 prompt 前缀的设计数据表与索引", () => {
    database = new Database(":memory:")

    createDesignTables(database)

    const tableNames = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name)
    const indexNames = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name)

    expect(tableNames).toEqual(["design", "module", "project"])
    expect(indexNames).toEqual(
      expect.arrayContaining([
        "idx_design_module_id",
        "idx_design_project_id",
        "idx_module_project_id",
      ]),
    )
  })
})
