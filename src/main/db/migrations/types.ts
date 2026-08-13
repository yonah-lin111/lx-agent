import type Database from "better-sqlite3"

// 单个数据迁移定义。
export interface Migration {
  version: number
  name: string
  up: (database: Database.Database) => void
}
