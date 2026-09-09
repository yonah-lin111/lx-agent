import type {
  ActivityDayEntry,
  GetOverviewStatsInput,
  OverviewMetrics,
  OverviewProjectOption,
  OverviewStats,
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

    // 3. 计算近 30 天与今日 Agent 对话轮次
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

    // 4. 工具调用总数与成功率
    const toolCallStatsRow = (
      isFiltered
        ? database
            .prepare(
              `SELECT count(*) as total, sum(CASE WHEN c.status = 'success' THEN 1 ELSE 0 END) as success_count
               FROM agent_call c
               JOIN agent_session s ON c.session_id = s.external_id
               WHERE s.project_id = ?`,
            )
            .get(targetProjectId)
        : database
            .prepare(
              `SELECT count(*) as total, sum(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count
               FROM agent_call`,
            )
            .get()
    ) as { total: number; success_count: number | null } | undefined

    const toolTotal = toolCallStatsRow?.total ?? 0
    const toolSuccessCount = toolCallStatsRow?.success_count ?? 0
    const toolSuccessRate = toolTotal > 0 ? Math.round((toolSuccessCount / toolTotal) * 100) : 100

    // 5. 项目条目完成进度
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

    // 6. 会话总览
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

    const metrics: OverviewMetrics = {
      agentTurns: {
        total30d: total30dTurns,
        today: todayTurns,
      },
      toolCalls: {
        total: toolTotal,
        successCount: toolSuccessCount,
        successRate: toolSuccessRate,
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
      projects,
    }
  },
})

// 生产环境概览服务单例。
export const overviewService = createOverviewService(getDatabase)
