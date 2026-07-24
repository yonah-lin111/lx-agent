import Database from "better-sqlite3"
import { ensureDatabaseDir, getDatabasePath } from "@/paths"

// SQLite 数据库单例。
let sqlite: Database.Database | null = null

/**
 * 创建项目、模块与提示词设计数据表。
 */
export const createDesignTables = (database: Database.Database): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS design_projects (
      id INTEGER PRIMARY KEY,
      external_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'virtual',
      path TEXT,
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS design_modules (
      id INTEGER PRIMARY KEY,
      external_id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL,
      FOREIGN KEY (project_id) REFERENCES design_projects(external_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_design_modules_project_id
    ON design_modules(project_id);

    CREATE TABLE IF NOT EXISTS design_items (
      id INTEGER PRIMARY KEY,
      external_id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      module_id TEXT,
      name TEXT NOT NULL,
      design_data TEXT,
      status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL,
      FOREIGN KEY (project_id) REFERENCES design_projects(external_id) ON DELETE CASCADE,
      FOREIGN KEY (module_id) REFERENCES design_modules(external_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_design_items_project_id
    ON design_items(project_id);

    CREATE INDEX IF NOT EXISTS idx_design_items_module_id
    ON design_items(module_id);
  `)
}

/**
 * 初始化并返回 SQLite 数据库连接。
 */
export const initDatabase = (): Database.Database => {
  if (sqlite) {
    return sqlite
  }

  ensureDatabaseDir()
  sqlite = new Database(getDatabasePath())
  sqlite.pragma("foreign_keys = ON")
  createDesignTables(sqlite)

  return sqlite
}

/**
 * 获取已初始化的 SQLite 数据库连接。
 */
export const getDatabase = (): Database.Database => initDatabase()
