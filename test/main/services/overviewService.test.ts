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
    expect(stats.metrics.activeDays.totalDays).toBe(0)
    expect(stats.metrics.activeDays.longestStreak).toBe(0)
    expect(stats.metrics.activeDays.currentStreak).toBe(0)
    expect(stats.metrics.activeDays.activeRate).toBe(0)
    expect(stats.metrics.toolDuration?.totalMs).toBe(0)
    expect(stats.metrics.toolDuration?.avgMs).toBe(0)
    expect(stats.metrics.projectItems?.total).toBe(0)
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

    // 插入工具调用（1 成功耗时 400ms，1 失败耗时 600ms）
    database
      .prepare(
        "INSERT INTO agent_call (external_id, session_id, kind, name, status, duration_ms, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("c1", "s1", "builtin", "read_file", "success", 400, now, now, now)
    database
      .prepare(
        "INSERT INTO agent_call (external_id, session_id, kind, name, status, duration_ms, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("c2", "s1", "builtin", "run_command", "error", 600, now, now, now)

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
    expect(stats.metrics.activeDays.totalDays).toBe(1)
    expect(stats.metrics.activeDays.longestStreak).toBe(1)
    expect(stats.metrics.activeDays.currentStreak).toBe(1)
    expect(stats.metrics.activeDays.activeRate).toBe(0)
    expect(stats.metrics.toolDuration?.totalMs).toBe(1000)
    expect(stats.metrics.toolDuration?.avgMs).toBe(500)
    expect(stats.metrics.projectItems?.total).toBe(2)
    expect(stats.metrics.projectItems?.todo).toBe(1)
    expect(stats.metrics.projectItems?.completed).toBe(1)
    expect(stats.metrics.projectItems?.completionRate).toBe(50)
    expect(stats.metrics.sessions.total).toBe(1)

    expect(stats.metrics.periodSummary).toEqual({
      range: "today",
      turns: 2,
      toolCalls: 2,
      toolSuccessRate: 50,
      toolAvgDurationMs: 500,
      sessionCount: 1,
    })

    const todayEntry = stats.activityHeatmap.find((item) => item.date === today)
    expect(todayEntry).toBeDefined()
    expect(todayEntry?.count).toBe(4) // 2 turns + 2 tool calls
    expect(todayEntry?.turns).toBe(2)
    expect(todayEntry?.toolCalls).toBe(2)
  })

  it("支持根据 timeRange 筛选统计简报", () => {
    const service = createOverviewService(() => database)
    const today = new Date()
    const now = today.toISOString()
    const tenDaysAgo = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()

    database
      .prepare(
        "INSERT INTO project (external_id, name, type, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("p1", "Project 1", "virtual", null, now, now)

    database
      .prepare(
        "INSERT INTO agent_session (external_id, project_id, title, cwd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("s1", "p1", "Session 1", "/tmp", now, now)
    database
      .prepare(
        "INSERT INTO agent_session (external_id, project_id, title, cwd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("s2", "p1", "Session 2", "/tmp", tenDaysAgo, tenDaysAgo)

    // s1 (today): 1 entry, 1 tool call
    database
      .prepare(
        "INSERT INTO agent_session_entry (external_id, session_id, seq, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("e1", "s1", 1, "user", "{}", now)
    database
      .prepare(
        "INSERT INTO agent_call (external_id, session_id, kind, name, status, duration_ms, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("c1", "s1", "builtin", "read_file", "success", 200, now, now, now)

    // s2 (10 days ago): 1 entry, 1 tool call
    database
      .prepare(
        "INSERT INTO agent_session_entry (external_id, session_id, seq, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("e2", "s2", 1, "user", "{}", tenDaysAgo)
    database
      .prepare(
        "INSERT INTO agent_call (external_id, session_id, kind, name, status, duration_ms, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("c2", "s2", "builtin", "run_command", "error", 800, tenDaysAgo, tenDaysAgo, tenDaysAgo)

    // 1. timeRange = 'today' -> 仅统计今天
    const statsToday = service.getStats({ timeRange: "today" })
    expect(statsToday.metrics.periodSummary).toEqual({
      range: "today",
      turns: 1,
      toolCalls: 1,
      toolSuccessRate: 100,
      toolAvgDurationMs: 200,
      sessionCount: 1,
    })

    // 2. timeRange = '7d' -> 10 天前的不会被包含
    const stats7d = service.getStats({ timeRange: "7d" })
    expect(stats7d.metrics.periodSummary).toEqual({
      range: "7d",
      turns: 1,
      toolCalls: 1,
      toolSuccessRate: 100,
      toolAvgDurationMs: 200,
      sessionCount: 1,
    })

    // 3. timeRange = '30d' -> 包含 10 天前的记录
    const stats30d = service.getStats({ timeRange: "30d" })
    expect(stats30d.metrics.periodSummary).toEqual({
      range: "30d",
      turns: 2,
      toolCalls: 2,
      toolSuccessRate: 50,
      toolAvgDurationMs: 500,
      sessionCount: 2,
    })

    // 4. timeRange = 'all' -> 包含全部记录
    const statsAll = service.getStats({ timeRange: "all" })
    expect(statsAll.metrics.periodSummary).toEqual({
      range: "all",
      turns: 2,
      toolCalls: 2,
      toolSuccessRate: 50,
      toolAvgDurationMs: 500,
      sessionCount: 2,
    })
  })

  it("支持 metricsProjectId 与 heatmapProjectId 独立筛选互不干扰", () => {
    const service = createOverviewService(() => database)
    const now = new Date().toISOString()
    const today = now.slice(0, 10)

    // 创建项目 p1 和 p2
    database
      .prepare(
        "INSERT INTO project (external_id, name, type, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("p1", "Project 1", "virtual", null, now, now)
    database
      .prepare(
        "INSERT INTO project (external_id, name, type, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("p2", "Project 2", "virtual", null, now, now)

    // p1 关联会话与 1 条消息
    database
      .prepare(
        "INSERT INTO agent_session (external_id, project_id, title, cwd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("s1", "p1", "Session 1", "/tmp", now, now)
    database
      .prepare(
        "INSERT INTO agent_session_entry (external_id, session_id, seq, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("e1", "s1", 1, "user", "{}", now)

    // p2 关联会话与 5 条消息
    database
      .prepare(
        "INSERT INTO agent_session (external_id, project_id, title, cwd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("s2", "p2", "Session 2", "/tmp", now, now)
    for (let i = 1; i <= 5; i++) {
      database
        .prepare(
          "INSERT INTO agent_session_entry (external_id, session_id, seq, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(`e2_${i}`, "s2", i, "user", "{}", now)
    }

    // 上方卡片选 p1，绿墙选 p2
    const stats = service.getStats({
      metricsProjectId: "p1",
      heatmapProjectId: "p2",
    })

    // 上方指标应准确反映 p1（1 条轮次）
    expect(stats.metrics.agentTurns.today).toBe(1)
    expect(stats.metrics.agentTurns.total30d).toBe(1)

    // 绿墙热力图应准确反映 p2（5 条轮次）
    const todayHeatmap = stats.activityHeatmap.find((item) => item.date === today)
    expect(todayHeatmap?.turns).toBe(5)
  })
})
