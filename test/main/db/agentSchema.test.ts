import Database from "better-sqlite3"
import { afterEach, describe, expect, it } from "vitest"
import { runMigrations } from "@/db"

// 测试使用的内存数据库。
let database: Database.Database | null = null

afterEach(() => {
  database?.close()
  database = null
})

describe("agent 表结构与约束", () => {
  it("迁移后创建 agent 四表与索引", () => {
    database = new Database(":memory:")
    database.pragma("foreign_keys = ON")

    runMigrations(database)

    const tableNames = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name)
    const indexNames = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
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
    expect(indexNames).toEqual(
      expect.arrayContaining([
        "idx_agent_session_page",
        "idx_agent_session_project",
        "idx_agent_session_entry_session_seq",
        "idx_agent_session_entry_type",
        "idx_agent_session_entry_parent",
        "idx_agent_call_session",
        "idx_agent_call_kind",
        "idx_agent_call_name",
        "idx_agent_call_parent",
        "idx_agent_call_entry",
        "idx_agent_snapshot_session",
      ]),
    )
    expect(indexNames).not.toContain("idx_agent_session_item")
  })

  it("会话支持绑定 project_id 与 page", () => {
    database = new Database(":memory:")
    database.pragma("foreign_keys = ON")
    runMigrations(database)
    const now = new Date().toISOString()
    // FK 目标：项目行。
    database
      .prepare(
        "INSERT INTO project (external_id, name, type, referenced_folders, created_at, updated_at) VALUES ('p', 'proj', 'filesystem', '[]', ?, ?)",
      )
      .run(now, now)

    const insert = (
      externalId: string,
      projectId: string | null,
      page: string | null,
    ): void => {
      database!
        .prepare(
          "INSERT INTO agent_session (external_id, project_id, page, title, cwd, created_at, updated_at) VALUES (?, ?, ?, 't', '/x', ?, ?)",
        )
        .run(externalId, projectId, page, now, now)
    }

    // 项目会话与独立页面会话均合法插入
    expect(() => insert("s1", "p", null)).not.toThrow()
    expect(() => insert("s2", null, "/")).not.toThrow()
    expect(() => insert("s3", "p", "/")).not.toThrow()
    expect(() => insert("s4", null, null)).not.toThrow()
  })
})
