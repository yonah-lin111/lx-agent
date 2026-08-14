import Database from "better-sqlite3"
import { afterEach, describe, expect, it } from "vitest"
import { runMigrations } from "@/db"

// 测试使用的内存数据库。
let database: Database.Database | null = null

afterEach(() => {
  database?.close()
  database = null
})

describe("runMigrations", () => {
  it("在全新库上按版本应用全部迁移并登记追踪表", () => {
    database = new Database(":memory:")
    database.pragma("foreign_keys = ON")

    runMigrations(database)

    const tableNames = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name)
    expect(tableNames).toEqual([
      "_migrations",
      "agent_call",
      "agent_session",
      "agent_session_entry",
      "agent_snapshot",
      "project",
      "project_folder",
      "project_item",
    ])
    const versions = database
      .prepare("SELECT version FROM _migrations ORDER BY version")
      .all()
      .map((row) => (row as { version: number }).version)
    expect(versions).toEqual([1, 2, 3, 6])
  })

  it("迁移后 project_item 移除 sort_order 并保留 worktree_path", () => {
    database = new Database(":memory:")
    runMigrations(database)

    const columns = database.prepare("PRAGMA table_info(project_item)").all() as Array<{
      name: string
    }>
    expect(columns.some((column) => column.name === "sort_order")).toBe(false)
    expect(columns.some((column) => column.name === "worktree_path")).toBe(true)
  })

  it("旧库按基线登记初始快照后只补跑新增迁移", () => {
    database = new Database(":memory:")
    // 模拟迁移系统启用前的旧库：已有项目表且 project_item 仍含 sort_order。
    database.exec(`
      CREATE TABLE project (
        id INTEGER PRIMARY KEY,
        external_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );
      CREATE TABLE project_item (
        id INTEGER PRIMARY KEY,
        external_id TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'todo',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );
    `)

    runMigrations(database)

    const versions = database
      .prepare("SELECT version FROM _migrations ORDER BY version")
      .all()
      .map((row) => (row as { version: number }).version)
    expect(versions).toEqual([1, 2, 3, 6])
    const columns = database.prepare("PRAGMA table_info(project_item)").all() as Array<{
      name: string
    }>
    expect(columns.some((column) => column.name === "sort_order")).toBe(false)
  })

  it("重复执行是幂等的", () => {
    database = new Database(":memory:")
    runMigrations(database)
    runMigrations(database)

    const versions = database
      .prepare("SELECT version FROM _migrations ORDER BY version")
      .all()
      .map((row) => (row as { version: number }).version)
    expect(versions).toEqual([1, 2, 3, 6])
  })
})
