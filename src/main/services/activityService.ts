import type { DailyActivity } from "@shared/contracts/activity"
import type Database from "better-sqlite3"
import { getDatabase } from "@/db"

// 绿墙覆盖的天数（含今天）。
const ACTIVITY_DAYS = 365

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
 * 提供近一年每日会话活跃度服务（按天去重有消息的会话）。
 */
export const createActivityService = (getConnection: () => Database.Database) => ({
  getDaily: (): DailyActivity[] => {
    const days = getDayRange(ACTIVITY_DAYS)
    const startDate = days[0]

    const rows = getConnection()
      .prepare(
        `SELECT substr(created_at, 1, 10) as day, count(DISTINCT session_id) as count
         FROM agent_session_entry
         WHERE substr(created_at, 1, 10) >= ?
         GROUP BY substr(created_at, 1, 10)`,
      )
      .all(startDate) as Array<{ day: string; count: number }>

    const countByDay = new Map<string, number>()
    for (const row of rows) {
      countByDay.set(row.day, row.count)
    }

    return days.map((date) => ({ date, count: countByDay.get(date) ?? 0 }))
  },
})

// 生产环境活动数据服务单例。
export const activityService = createActivityService(getDatabase)
