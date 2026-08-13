import Database from "better-sqlite3"
import { runMigrations } from "@/db/migrate"
import { ensureDatabaseDir, getDatabasePath } from "@/paths"

// SQLite 数据库单例。
let sqlite: Database.Database | null = null

/**
 * 初始化并返回 SQLite 数据库连接。
 */
export const initDatabase = (): Database.Database => {
  if (sqlite) return sqlite

  ensureDatabaseDir()
  sqlite = new Database(getDatabasePath())
  sqlite.pragma("foreign_keys = ON")
  runMigrations(sqlite)
  return sqlite
}

/**
 * 获取已初始化的 SQLite 数据库连接。
 */
export const getDatabase = (): Database.Database => initDatabase()
