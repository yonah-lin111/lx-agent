import type Database from "better-sqlite3"

/**
 * 创建项目、模块与提示词设计数据表。
 */
export const createDesignTables = (database: Database.Database): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS project (
      id INTEGER PRIMARY KEY,
      external_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'virtual',
      path TEXT,
      referenced_folders TEXT NOT NULL DEFAULT '[]',
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS module (
      id INTEGER PRIMARY KEY,
      external_id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(external_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_module_project_id ON module(project_id);

    CREATE TABLE IF NOT EXISTS design (
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
      FOREIGN KEY (project_id) REFERENCES project(external_id) ON DELETE CASCADE,
      FOREIGN KEY (module_id) REFERENCES module(external_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_design_project_id ON design(project_id);
    CREATE INDEX IF NOT EXISTS idx_design_module_id ON design(module_id);
  `)
}
