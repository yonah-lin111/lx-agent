import Database from "better-sqlite3"
import { afterEach, describe, expect, it } from "vitest"
import { createAgentTables, createProjectTables } from "@/db"

// 测试使用的内存数据库。
let database: Database.Database | null = null

afterEach(() => {
  database?.close()
  database = null
})

describe("createAgentTables", () => {
  it("创建 agent 三表与索引", () => {
    database = new Database(":memory:")
    database.pragma("foreign_keys = ON")

    createAgentTables(database)

    const tableNames = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name)
    const indexNames = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name)

    expect(tableNames).toEqual([
      "agent_call",
      "agent_session",
      "agent_session_entry",
      "agent_snapshot",
    ])
    expect(indexNames).toEqual(
      expect.arrayContaining([
        "idx_agent_session_item",
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
  })

  it("会话归属互斥：item 与 page 不能同时为空或同时存在", () => {
    database = new Database(":memory:")
    database.pragma("foreign_keys = ON")
    createProjectTables(database)
    createAgentTables(database)
    const now = new Date().toISOString()
    // FK 目标：项目与条目行。
    database
      .prepare(
        "INSERT INTO project (external_id, name, type, referenced_folders, created_at, updated_at) VALUES ('p', 'proj', 'filesystem', '[]', ?, ?)",
      )
      .run(now, now)
    for (const itemId of ["item1", "item2"]) {
      database
        .prepare(
          "INSERT INTO project_item (external_id, project_id, name, item_data, enabled_folder_paths, status, sort_order, created_at, updated_at) VALUES (?, 'p', 'item', '', '[]', 'todo', 0, ?, ?)",
        )
        .run(itemId, now, now)
    }
    const insert = (
      externalId: string,
      projectItemId: string | null,
      page: string | null,
    ): void => {
      database!
        .prepare(
          "INSERT INTO agent_session (external_id, project_item_id, project_id, page, title, cwd, created_at, updated_at) VALUES (?, ?, ?, ?, 't', '/x', ?, ?)",
        )
        .run(externalId, projectItemId, projectItemId ? "p" : null, page, now, now)
    }

    // item 会话（page 为空）与页面会话（item 为空）合法。
    expect(() => insert("s1", "item1", null)).not.toThrow()
    expect(() => insert("s2", null, "/")).not.toThrow()
    // 两者皆空或同时存在违反互斥约束。
    expect(() => insert("s3", null, null)).toThrow()
    expect(() => insert("s4", "item2", "/")).toThrow()
  })
})
