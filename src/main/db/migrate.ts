import type Database from "better-sqlite3"
import { migrations } from "./migrations"

// 迁移追踪表名。
const MIGRATIONS_TABLE = "_migrations"

// 旧库探测表：迁移系统启用前即存在 project_item 表判定为旧库。
const LEGACY_PROBE_TABLE = "project_item"

/**
 * 指定表是否存在。
 */
const tableExists = (database: Database.Database, tableName: string): boolean =>
  database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) !== undefined

/**
 * 应用所有未执行的数据迁移。每个迁移在独立事务内执行并登记，
 * 迁移系统启用前的旧库按基线登记初始快照，只补跑其后的新增迁移。
 */
export const runMigrations = (database: Database.Database): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMP NOT NULL
    )
  `)

  const hasAppliedRecords =
    (
      database.prepare(`SELECT COUNT(*) AS count FROM ${MIGRATIONS_TABLE}`).get() as {
        count: number
      }
    ).count > 0
  const isLegacy = !hasAppliedRecords && tableExists(database, LEGACY_PROBE_TABLE)

  // 旧库基线：把迁移系统启用前已烘焙进旧库的初始快照登记为已应用。
  if (isLegacy) {
    const baseline = migrations[0]
    const now = new Date().toISOString()
    database
      .prepare(
        `INSERT OR IGNORE INTO ${MIGRATIONS_TABLE} (version, name, applied_at) VALUES (?, ?, ?)`,
      )
      .run(baseline.version, baseline.name, now)
  }

  const record = database.prepare(
    `INSERT INTO ${MIGRATIONS_TABLE} (version, name, applied_at) VALUES (?, ?, ?)`,
  )

  for (const migration of migrations) {
    const applied = database
      .prepare(`SELECT name FROM ${MIGRATIONS_TABLE} WHERE version = ?`)
      .get(migration.version) as { name: string } | undefined
    if (applied) {
      // 版本号被其他分支的迁移占用：只按版本号判断会静默跳过当前迁移，这里显式告警。
      if (applied.name !== migration.name) {
        console.warn(
          `迁移版本 ${migration.version} 已登记为 "${applied.name}"，与当前定义的 "${migration.name}" 不一致，已跳过；请为该迁移换用更大的版本号。`,
        )
      }
      continue
    }

    database.transaction(() => {
      migration.up(database)
      record.run(migration.version, migration.name, new Date().toISOString())
    })()
  }
}
