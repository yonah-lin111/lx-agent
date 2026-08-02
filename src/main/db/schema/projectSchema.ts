import type Database from "better-sqlite3"

/**
 * 创建项目、文件夹与项目条目数据表。
 */
export const createProjectTables = (database: Database.Database): void => {
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

    CREATE TABLE IF NOT EXISTS project_folder (
      id INTEGER PRIMARY KEY,
      external_id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(external_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_project_folder_project_id ON project_folder(project_id);

    CREATE TABLE IF NOT EXISTS project_item (
      id INTEGER PRIMARY KEY,
      external_id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      project_folder_id TEXT,
      name TEXT NOT NULL,
      item_data TEXT,
      status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(external_id) ON DELETE CASCADE,
      FOREIGN KEY (project_folder_id) REFERENCES project_folder(external_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_project_item_project_id ON project_item(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_item_folder_id ON project_item(project_folder_id);
  `)
}
