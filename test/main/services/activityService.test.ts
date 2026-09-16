import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runMigrations } from "@/db"
import { createActivityService } from "@/services/activityService"

let database: Database.Database

beforeEach(() => {
  database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  runMigrations(database)
})

afterEach(() => {
  database.close()
})

// 本地时区日期键（与服务端聚合口径一致）。
const toDateKey = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

const insertSession = (externalId: string, createdAt: string): void => {
  database
    .prepare(
      "INSERT INTO agent_session (external_id, title, cwd, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(externalId, externalId, "/tmp", createdAt, createdAt)
}

const insertEntry = (
  externalId: string,
  sessionId: string,
  seq: number,
  createdAt: string,
): void => {
  database
    .prepare(
      "INSERT INTO agent_session_entry (external_id, session_id, seq, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(externalId, sessionId, seq, "user", "{}", createdAt)
}

describe("activityService", () => {
  it("空数据库返回近 365 天全零记录（含今天）", () => {
    const daily = createActivityService(() => database).getDaily()

    expect(daily).toHaveLength(365)
    expect(daily.every((entry) => entry.count === 0)).toBe(true)
    expect(daily[daily.length - 1].date).toBe(toDateKey(new Date()))

    const firstDate = new Date()
    firstDate.setDate(firstDate.getDate() - 364)
    expect(daily[0].date).toBe(toDateKey(firstDate))
  })

  it("按天去重会话：同会话多条消息计 1，多会话各计 1", () => {
    const now = new Date().toISOString()
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()

    insertSession("s1", now)
    insertSession("s2", now)
    insertSession("s3", tenDaysAgo)

    // s1 今日 2 条消息仅计 1 个会话
    insertEntry("e1", "s1", 1, now)
    insertEntry("e2", "s1", 2, now)
    // s2 今日 1 条消息
    insertEntry("e3", "s2", 1, now)
    // s3 10 天前 1 条消息
    insertEntry("e4", "s3", 1, tenDaysAgo)

    const daily = createActivityService(() => database).getDaily()
    const byDate = new Map(daily.map((entry) => [entry.date, entry.count]))

    expect(byDate.get(toDateKey(new Date()))).toBe(2)
    expect(byDate.get(toDateKey(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)))).toBe(1)
    expect(daily.reduce((sum, entry) => sum + entry.count, 0)).toBe(3)
  })

  it("忽略 365 天范围之前的消息记录", () => {
    const fourHundredDaysAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString()
    insertSession("s1", fourHundredDaysAgo)
    insertEntry("e1", "s1", 1, fourHundredDaysAgo)

    const daily = createActivityService(() => database).getDaily()

    expect(daily.reduce((sum, entry) => sum + entry.count, 0)).toBe(0)
  })
})
