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
  // 多开发实例共享同一数据库：WAL 允许跨进程读写并行，busy_timeout 在写锁竞争时自动重试等待。
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("busy_timeout = 5000")
  sqlite.pragma("foreign_keys = ON")
  runMigrations(sqlite)
  return sqlite
}

/**
 * 获取已初始化的 SQLite 数据库连接。
 */
export const getDatabase = (): Database.Database => initDatabase()
