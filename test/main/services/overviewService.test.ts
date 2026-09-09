import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runMigrations } from "@/db"
import { createOverviewService } from "@/services/overviewService"

let database: Database.Database

beforeEach(() => {
  database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  runMigrations(database)
})

afterEach(() => {
  database.close()
})

describe("overviewService", () => {
  it("空数据库返回正确的默认指标与 365 天热力图", () => {
    const service = createOverviewService(() => database)
    const stats = service.getStats()

    expect(stats.activityHeatmap).toHaveLength(365)
    expect(stats.metrics.agentTurns.total30d).toBe(0)
    expect(stats.metrics.agentTurns.today).toBe(0)
    expect(stats.metrics.toolCalls.total).toBe(0)
    expect(stats.metrics.toolCalls.successRate).toBe(100)
    expect(stats.metrics.projectItems.total).toBe(0)
    expect(stats.metrics.sessions.total).toBe(0)
    expect(stats.activeProjectId).toBe("all")
    expect(stats.projects).toEqual([])
  })

  it("正确聚合对话轮次、工具调用与项目条目数据", () => {
    const service = createOverviewService(() => database)
    const now = new Date().toISOString()
    const today = now.slice(0, 10)

    // 插入项目
    database
      .prepare(
        "INSERT INTO project (external_id, name, type, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("p1", "Project 1", "virtual", null, now, now)

    // 插入会话
    database
      .prepare(
        "INSERT INTO agent_session (external_id, project_id, title, cwd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("s1", "p1", "Session 1", "/tmp", now, now)

    // 插入会话消息条目（2 条今天）
    database
      .prepare(
        "INSERT INTO agent_session_entry (external_id, session_id, seq, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("e1", "s1", 1, "user", "{}", now)
    database
      .prepare(
        "INSERT INTO agent_session_entry (external_id, session_id, seq, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("e2", "s1", 2, "assistant", "{}", now)

    // 插入工具调用（1 成功，1 失败）
    database
      .prepare(
        "INSERT INTO agent_call (external_id, session_id, kind, name, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("c1", "s1", "builtin", "read_file", "success", now, now, now)
    database
      .prepare(
        "INSERT INTO agent_call (external_id, session_id, kind, name, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("c2", "s1", "builtin", "run_command", "error", now, now, now)

    // 插入项目条目（1 todo, 1 completed）
    database
      .prepare(
        "INSERT INTO project_item (external_id, project_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("item1", "p1", "Task 1", "todo", now, now)
    database
      .prepare(
        "INSERT INTO project_item (external_id, project_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("item2", "p1", "Task 2", "completed", now, now)

    const stats = service.getStats({ projectId: "p1" })

    expect(stats.activeProjectId).toBe("p1")
    expect(stats.metrics.agentTurns.today).toBe(2)
    expect(stats.metrics.agentTurns.total30d).toBe(2)
    expect(stats.metrics.toolCalls.total).toBe(2)
    expect(stats.metrics.toolCalls.successCount).toBe(1)
    expect(stats.metrics.toolCalls.successRate).toBe(50)
    expect(stats.metrics.projectItems.total).toBe(2)
    expect(stats.metrics.projectItems.todo).toBe(1)
    expect(stats.metrics.projectItems.completed).toBe(1)
    expect(stats.metrics.projectItems.completionRate).toBe(50)
    expect(stats.metrics.sessions.total).toBe(1)

    const todayEntry = stats.activityHeatmap.find((item) => item.date === today)
    expect(todayEntry).toBeDefined()
    expect(todayEntry?.count).toBe(4) // 2 turns + 2 tool calls
    expect(todayEntry?.turns).toBe(2)
    expect(todayEntry?.toolCalls).toBe(2)
  })
})
