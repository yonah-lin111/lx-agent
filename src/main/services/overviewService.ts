import type {
  ActivityDayEntry,
  GetOverviewStatsInput,
  OverviewMetrics,
  OverviewPeriodSummary,
  OverviewProjectOption,
  OverviewStats,
  OverviewTimeRange,
} from "@shared/contracts/overview"
import type Database from "better-sqlite3"
import { getDatabase } from "@/db"

// 格式化日期为 YYYY-MM-DD 字符串。
const formatDateKey = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * 计算过去 N 天的日期列表（从最早到今天）。
 */
const getDayRange = (days: number): string[] => {
  const dates: string[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const target = new Date(today)
    target.setDate(today.getDate() - i)
    dates.push(formatDateKey(target))
  }
  return dates
}

/**
 * 提供主页概览、活动热力图及统计指标服务。
 */
export const createOverviewService = (getConnection: () => Database.Database) => ({
  getStats: (input?: GetOverviewStatsInput): OverviewStats => {
    const database = getConnection()
    const targetProjectId = input?.projectId?.trim()
    const isFiltered = Boolean(targetProjectId && targetProjectId !== "all")
    const timeRange: OverviewTimeRange = input?.timeRange ?? "today"

    // 1. 获取所有项目列表供切换器使用
    const projectRows = database
      .prepare("SELECT external_id as id, name FROM project ORDER BY updated_at DESC, id DESC")
      .all() as Array<{ id: string; name: string }>
    const projects: OverviewProjectOption[] = projectRows.map((row) => ({
      id: row.id,
      name: row.name,
    }))

    // 2. 生成近 365 天日期序列并聚合活动记录
    const heatmapDays = getDayRange(365)
    const startDate = heatmapDays[0]
    const todayKey = heatmapDays[heatmapDays.length - 1]

    const turnRows = isFiltered
      ? (database
          .prepare(
            `SELECT substr(e.created_at, 1, 10) as day, count(*) as count
             FROM agent_session_entry e
             JOIN agent_session s ON e.session_id = s.external_id
             WHERE s.project_id = ? AND substr(e.created_at, 1, 10) >= ?
             GROUP BY substr(e.created_at, 1, 10)`,
          )
          .all(targetProjectId, startDate) as Array<{ day: string; count: number }>)
      : (database
          .prepare(
            `SELECT substr(created_at, 1, 10) as day, count(*) as count
             FROM agent_session_entry
             WHERE substr(created_at, 1, 10) >= ?
             GROUP BY substr(created_at, 1, 10)`,
          )
          .all(startDate) as Array<{ day: string; count: number }>)

    const toolCallRows = isFiltered
      ? (database
          .prepare(
            `SELECT substr(c.created_at, 1, 10) as day, count(*) as count
             FROM agent_call c
             JOIN agent_session s ON c.session_id = s.external_id
             WHERE s.project_id = ? AND substr(c.created_at, 1, 10) >= ?
             GROUP BY substr(c.created_at, 1, 10)`,
          )
          .all(targetProjectId, startDate) as Array<{ day: string; count: number }>)
      : (database
          .prepare(
            `SELECT substr(created_at, 1, 10) as day, count(*) as count
             FROM agent_call
             WHERE substr(created_at, 1, 10) >= ?
             GROUP BY substr(created_at, 1, 10)`,
          )
          .all(startDate) as Array<{ day: string; count: number }>)

    const turnsByDay = new Map<string, number>()
    for (const row of turnRows) {
      turnsByDay.set(row.day, row.count)
    }

    const toolCallsByDay = new Map<string, number>()
    for (const row of toolCallRows) {
      toolCallsByDay.set(row.day, row.count)
    }

    const activityHeatmap: ActivityDayEntry[] = heatmapDays.map((date) => {
      const turns = turnsByDay.get(date) ?? 0
      const toolCalls = toolCallsByDay.get(date) ?? 0
      return {
        date,
        count: turns + toolCalls,
        turns,
        toolCalls,
      }
    })

    // 3. 计算活跃天数与连续打卡统计（Streak）
    let totalActiveDays = 0
    let longestStreak = 0
    let runningStreak = 0

    for (let i = 0; i < activityHeatmap.length; i++) {
      if (activityHeatmap[i].count > 0) {
        totalActiveDays += 1
        runningStreak += 1
        if (runningStreak > longestStreak) {
          longestStreak = runningStreak
        }
      } else {
        runningStreak = 0
      }
    }

    let currentStreak = 0
    for (let i = activityHeatmap.length - 1; i >= 0; i--) {
      if (activityHeatmap[i].count > 0) {
        currentStreak += 1
      } else {
        if (i === activityHeatmap.length - 1) {
          // 今天尚无交互，允许昨天作为有效连击点
          continue
        }
        break
      }
    }

    const activeRate =
      activityHeatmap.length > 0 ? Math.round((totalActiveDays / activityHeatmap.length) * 100) : 0

    // 4. 计算近 30 天与今日 Agent 对话轮次
    const thirtyDaysAgoKey = heatmapDays[Math.max(0, heatmapDays.length - 30)]
    let total30dTurns = 0
    let todayTurns = 0
    for (const [day, count] of turnsByDay.entries()) {
      if (day >= thirtyDaysAgoKey) {
        total30dTurns += count
      }
      if (day === todayKey) {
        todayTurns += count
      }
    }

    // 5. 工具调用总数、成功率与执行耗时（全部历史）
    const toolCallStatsRow = (
      isFiltered
        ? database
            .prepare(
              `SELECT
                 count(*) as total,
                 sum(CASE WHEN c.status = 'success' THEN 1 ELSE 0 END) as success_count,
                 sum(COALESCE(c.duration_ms, 0)) as total_duration_ms,
                 avg(CASE WHEN c.duration_ms IS NOT NULL AND c.duration_ms > 0 THEN c.duration_ms ELSE NULL END) as avg_duration_ms
               FROM agent_call c
               JOIN agent_session s ON c.session_id = s.external_id
               WHERE s.project_id = ?`,
            )
            .get(targetProjectId)
        : database
            .prepare(
              `SELECT
                 count(*) as total,
                 sum(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                 sum(COALESCE(duration_ms, 0)) as total_duration_ms,
                 avg(CASE WHEN duration_ms IS NOT NULL AND duration_ms > 0 THEN duration_ms ELSE NULL END) as avg_duration_ms
               FROM agent_call`,
            )
            .get()
    ) as
      | {
          total: number
          success_count: number | null
          total_duration_ms: number | null
          avg_duration_ms: number | null
        }
      | undefined

    const toolTotal = toolCallStatsRow?.total ?? 0
    const toolSuccessCount = toolCallStatsRow?.success_count ?? 0
    const toolSuccessRate = toolTotal > 0 ? Math.round((toolSuccessCount / toolTotal) * 100) : 100
    const toolTotalDurationMs = toolCallStatsRow?.total_duration_ms ?? 0
    const toolAvgDurationMs = Math.round(toolCallStatsRow?.avg_duration_ms ?? 0)

    // 6. 项目条目完成进度
    const itemRows = (
      isFiltered
        ? database
            .prepare(
              `SELECT status, count(*) as count
               FROM project_item
               WHERE project_id = ?
               GROUP BY status`,
            )
            .all(targetProjectId)
        : database
            .prepare(
              `SELECT status, count(*) as count
               FROM project_item
               GROUP BY status`,
            )
            .all()
    ) as Array<{ status: string; count: number }>

    let todoItems = 0
    let inProgressItems = 0
    let completedItems = 0
    for (const row of itemRows) {
      if (row.status === "todo") todoItems += row.count
      if (row.status === "in_progress") inProgressItems += row.count
      if (row.status === "completed") completedItems += row.count
    }
    const totalItems = todoItems + inProgressItems + completedItems
    const itemCompletionRate = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

    // 7. 会话总览
    const sessionRow = (
      isFiltered
        ? database
            .prepare(
              `SELECT count(*) as total, max(updated_at) as last_active
               FROM agent_session
               WHERE project_id = ?`,
            )
            .get(targetProjectId)
        : database
            .prepare(
              `SELECT count(*) as total, max(updated_at) as last_active
               FROM agent_session`,
            )
            .get()
    ) as { total: number; last_active: string | null } | undefined

    // 8. 周期统计简报（支持今日、近 7 天、近 30 天与全部时间）
    let rangeStartDate: string | null = null
    if (timeRange === "today") {
      rangeStartDate = todayKey
    } else if (timeRange === "7d") {
      rangeStartDate = heatmapDays[Math.max(0, heatmapDays.length - 7)]
    } else if (timeRange === "30d") {
      rangeStartDate = thirtyDaysAgoKey
    }

    let periodTurns = 0
    if (rangeStartDate) {
      for (const [day, count] of turnsByDay.entries()) {
        if (day >= rangeStartDate) {
          periodTurns += count
        }
      }
    } else {
      const allTurnsRow = isFiltered
        ? (database
            .prepare(
              `SELECT count(*) as count
               FROM agent_session_entry e
               JOIN agent_session s ON e.session_id = s.external_id
               WHERE s.project_id = ?`,
            )
            .get(targetProjectId) as { count: number } | undefined)
        : (database.prepare("SELECT count(*) as count FROM agent_session_entry").get() as
            | { count: number }
            | undefined)
      periodTurns = allTurnsRow?.count ?? 0
    }

    const periodToolCallRow = rangeStartDate
      ? ((isFiltered
          ? database
              .prepare(
                `SELECT
                   count(*) as total,
                   sum(CASE WHEN c.status = 'success' THEN 1 ELSE 0 END) as success_count,
                   avg(CASE WHEN c.duration_ms IS NOT NULL AND c.duration_ms > 0 THEN c.duration_ms ELSE NULL END) as avg_duration_ms
                 FROM agent_call c
                 JOIN agent_session s ON c.session_id = s.external_id
                 WHERE s.project_id = ? AND substr(c.created_at, 1, 10) >= ?`,
              )
              .get(targetProjectId, rangeStartDate)
          : database
              .prepare(
                `SELECT
                   count(*) as total,
                   sum(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                   avg(CASE WHEN duration_ms IS NOT NULL AND duration_ms > 0 THEN duration_ms ELSE NULL END) as avg_duration_ms
                 FROM agent_call
                 WHERE substr(created_at, 1, 10) >= ?`,
              )
              .get(rangeStartDate)) as
          | { total: number; success_count: number | null; avg_duration_ms: number | null }
          | undefined)
      : toolCallStatsRow

    const periodToolTotal = periodToolCallRow?.total ?? 0
    const periodToolSuccess = periodToolCallRow?.success_count ?? 0
    const periodToolSuccessRate =
      periodToolTotal > 0 ? Math.round((periodToolSuccess / periodToolTotal) * 100) : 100
    const periodToolAvgDurationMs = Math.round(periodToolCallRow?.avg_duration_ms ?? 0)

    let periodSessionTotal = 0
    if (rangeStartDate) {
      const periodSessionRow = (
        isFiltered
          ? database
              .prepare(
                `SELECT count(*) as total
                 FROM agent_session
                 WHERE project_id = ? AND substr(created_at, 1, 10) >= ?`,
              )
              .get(targetProjectId, rangeStartDate)
          : database
              .prepare(
                `SELECT count(*) as total
                 FROM agent_session
                 WHERE substr(created_at, 1, 10) >= ?`,
              )
              .get(rangeStartDate)
      ) as { total: number } | undefined
      periodSessionTotal = periodSessionRow?.total ?? 0
    } else {
      periodSessionTotal = sessionRow?.total ?? 0
    }

    const periodSummary: OverviewPeriodSummary = {
      range: timeRange,
      turns: periodTurns,
      toolCalls: periodToolTotal,
      toolSuccessRate: periodToolSuccessRate,
      toolAvgDurationMs: periodToolAvgDurationMs,
      sessionCount: periodSessionTotal,
    }

    const metrics: OverviewMetrics = {
      periodSummary,
      agentTurns: {
        total30d: total30dTurns,
        today: todayTurns,
      },
      toolCalls: {
        total: toolTotal,
        successCount: toolSuccessCount,
        successRate: toolSuccessRate,
      },
      activeDays: {
        totalDays: totalActiveDays,
        longestStreak,
        currentStreak,
        activeRate,
      },
      toolDuration: {
        totalMs: toolTotalDurationMs,
        avgMs: toolAvgDurationMs,
      },
      projectItems: {
        total: totalItems,
        todo: todoItems,
        inProgress: inProgressItems,
        completed: completedItems,
        completionRate: itemCompletionRate,
      },
      sessions: {
        total: sessionRow?.total ?? 0,
        lastActiveAt: sessionRow?.last_active ?? null,
      },
    }

    return {
      metrics,
      activityHeatmap,
      activeProjectId: isFiltered ? targetProjectId : "all",
      timeRange,
      projects,
    }
  },
})

// 生产环境概览服务单例。
export const overviewService = createOverviewService(getDatabase)
