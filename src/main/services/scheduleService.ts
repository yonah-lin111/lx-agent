import type {
  CreateScheduleItemInput,
  ListScheduleItemsInput,
  ReorderScheduleItemsInput,
  ScheduleDayStats,
  ScheduleItem,
  SchedulePriority,
  ScheduleRangeStatsInput,
  UpdateScheduleItemInput,
} from "@shared/contracts/schedule"
import type Database from "better-sqlite3"
import { getDatabase } from "@/db"

// 条目正文长度上限，避免单条文本无界增长。
const MAX_CONTENT_LENGTH = 500

// 合法优先级集合。
const PRIORITIES: readonly SchedulePriority[] = ["P0", "P1", "P2", "P3"]

// 本地日期键格式。
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// 数据库行结构。
interface ScheduleItemRow {
  id: number
  entry_date: string
  content: string
  priority: SchedulePriority
  completed: number
  completed_date: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

// 校验本地日期键：格式正确且真实存在（拒绝 2026-02-30 这类溢出日期）。
const assertDateKey = (value: unknown): string => {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) {
    throw new Error("INVALID_SCHEDULE_INPUT")
  }

  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10))
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("INVALID_SCHEDULE_INPUT")
  }

  return value
}

// 校验并归一化正文。
const assertContent = (value: unknown): string => {
  if (typeof value !== "string") throw new Error("INVALID_SCHEDULE_INPUT")
  const content = value.trim()
  if (!content || content.length > MAX_CONTENT_LENGTH) throw new Error("INVALID_SCHEDULE_INPUT")
  return content
}

// 校验优先级。
const assertPriority = (value: unknown): SchedulePriority => {
  if (typeof value !== "string" || !PRIORITIES.includes(value as SchedulePriority)) {
    throw new Error("INVALID_SCHEDULE_INPUT")
  }
  return value as SchedulePriority
}

// 校验整数 id。
const assertItemId = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("INVALID_SCHEDULE_INPUT")
  }
  return value
}

// 本机本地日期键（与 renderer 的 YYYY-MM-DD 口径一致）。
const toLocalDateKey = (): string => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

// 行 → 契约对象。
const toScheduleItem = (row: ScheduleItemRow): ScheduleItem => ({
  id: row.id,
  entryDate: row.entry_date,
  content: row.content,
  priority: row.priority,
  completed: row.completed === 1,
  completedDate: row.completed_date,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/**
 * 创建日程服务：单日条目读写在 schedule_item 表内完成，日期一律使用本地日期键。
 */
export const createScheduleService = (getConnection: () => Database.Database) => {
  // 读取指定日期的下一个置顶排序值（当日最小值 - 1）。
  const readNextSortOrder = (database: Database.Database, entryDate: string): number =>
    (
      database
        .prepare(
          "SELECT COALESCE(MIN(sort_order), 0) - 1 AS next_order FROM schedule_item WHERE entry_date = ?",
        )
        .get(entryDate) as { next_order: number }
    ).next_order

  // 读取单条行，缺失抛 NOT_FOUND。
  const readRow = (database: Database.Database, id: number): ScheduleItemRow => {
    const row = database.prepare("SELECT * FROM schedule_item WHERE id = ?").get(id) as
      | ScheduleItemRow
      | undefined
    if (!row) throw new Error("SCHEDULE_ITEM_NOT_FOUND")
    return row
  }

  // 按日读取条目（手动排序值升序）。
  const listByDate = (input: ListScheduleItemsInput): ScheduleItem[] => {
    const entryDate = assertDateKey(input?.entryDate)
    const rows = getConnection()
      .prepare("SELECT * FROM schedule_item WHERE entry_date = ? ORDER BY sort_order ASC, id ASC")
      .all(entryDate) as ScheduleItemRow[]
    return rows.map(toScheduleItem)
  }

  // 新建条目：默认 P1，置顶插入当日列表。
  const create = (input: CreateScheduleItemInput): ScheduleItem => {
    const entryDate = assertDateKey(input?.entryDate)
    const content = assertContent(input?.content)
    const priority = input?.priority === undefined ? "P1" : assertPriority(input.priority)

    const database = getConnection()
    const now = new Date().toISOString()
    const result = database
      .prepare(
        `INSERT INTO schedule_item (entry_date, content, priority, completed, completed_date, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 0, NULL, ?, ?, ?)`,
      )
      .run(entryDate, content, priority, readNextSortOrder(database, entryDate), now, now)

    return toScheduleItem(readRow(database, Number(result.lastInsertRowid)))
  }

  // 更新条目：支持正文 / 优先级 / 完成状态与跨日移动。
  const update = (input: UpdateScheduleItemInput): ScheduleItem => {
    if (!input || typeof input !== "object") throw new Error("INVALID_SCHEDULE_INPUT")
    const id = assertItemId(input.id)
    if (input.completed !== undefined && typeof input.completed !== "boolean") {
      throw new Error("INVALID_SCHEDULE_INPUT")
    }

    const database = getConnection()
    const existing = readRow(database, id)

    const nextContent =
      input.content === undefined ? existing.content : assertContent(input.content)
    const nextPriority =
      input.priority === undefined ? existing.priority : assertPriority(input.priority)
    const nextCompleted = input.completed === undefined ? existing.completed === 1 : input.completed
    const nextEntryDate =
      input.entryDate === undefined ? existing.entry_date : assertDateKey(input.entryDate)

    // 完成日期：首次完成记录当天，取消完成清空。
    let nextCompletedDate = existing.completed_date
    if (nextCompleted && existing.completed !== 1) nextCompletedDate = toLocalDateKey()
    if (!nextCompleted) nextCompletedDate = null

    // 跨日移动并入目标日期顶部；同日更新保持原排序。
    const nextSortOrder =
      nextEntryDate === existing.entry_date
        ? existing.sort_order
        : readNextSortOrder(database, nextEntryDate)

    database
      .prepare(
        `UPDATE schedule_item
         SET entry_date = ?, content = ?, priority = ?, completed = ?, completed_date = ?, sort_order = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        nextEntryDate,
        nextContent,
        nextPriority,
        nextCompleted ? 1 : 0,
        nextCompletedDate,
        nextSortOrder,
        new Date().toISOString(),
        id,
      )

    return toScheduleItem(readRow(database, id))
  }

  // 删除条目。
  const remove = (id: number): void => {
    const result = getConnection()
      .prepare("DELETE FROM schedule_item WHERE id = ?")
      .run(assertItemId(id))
    if (result.changes === 0) throw new Error("SCHEDULE_ITEM_NOT_FOUND")
  }

  // 按传入顺序重写当日排序（目标 id 必须全部属于该日期）。
  const reorder = (input: ReorderScheduleItemsInput): void => {
    const entryDate = assertDateKey(input?.entryDate)
    if (!Array.isArray(input?.ids)) throw new Error("INVALID_SCHEDULE_INPUT")
    const ids = input.ids.map(assertItemId)

    const database = getConnection()
    const updateOrder = database.prepare(
      "UPDATE schedule_item SET sort_order = ?, updated_at = ? WHERE id = ? AND entry_date = ?",
    )
    const now = new Date().toISOString()

    database.transaction(() => {
      ids.forEach((id, index) => {
        if (updateOrder.run(index, now, id, entryDate).changes === 0) {
          throw new Error("INVALID_SCHEDULE_REORDER")
        }
      })
    })()
  }

  // 区间统计：按日返回计划数与完成数（仅含有数据的日期，缺日由调用方补齐）。
  const listRangeStats = (input: ScheduleRangeStatsInput): ScheduleDayStats[] => {
    const startDate = assertDateKey(input?.startDate)
    const endDate = assertDateKey(input?.endDate)
    if (startDate > endDate) throw new Error("INVALID_SCHEDULE_INPUT")

    const database = getConnection()
    const plannedRows = database
      .prepare(
        `SELECT entry_date AS date, COUNT(*) AS count FROM schedule_item
         WHERE entry_date BETWEEN ? AND ? GROUP BY entry_date`,
      )
      .all(startDate, endDate) as Array<{ date: string; count: number }>
    const completedRows = database
      .prepare(
        `SELECT completed_date AS date, COUNT(*) AS count FROM schedule_item
         WHERE completed = 1 AND completed_date BETWEEN ? AND ? GROUP BY completed_date`,
      )
      .all(startDate, endDate) as Array<{ date: string; count: number }>

    const merged = new Map<string, ScheduleDayStats>()
    for (const row of plannedRows) {
      merged.set(row.date, { date: row.date, plannedCount: row.count, completedCount: 0 })
    }
    for (const row of completedRows) {
      const entry = merged.get(row.date) ?? { date: row.date, plannedCount: 0, completedCount: 0 }
      entry.completedCount = row.count
      merged.set(row.date, entry)
    }

    return [...merged.values()].sort((left, right) => left.date.localeCompare(right.date))
  }

  return { listByDate, create, update, remove, reorder, listRangeStats }
}

// 日程服务单例。
export const scheduleService = createScheduleService(getDatabase)
