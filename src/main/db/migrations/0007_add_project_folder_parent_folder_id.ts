import type { Migration } from "./types"

/**
 * 为 project_folder 表增加 parent_folder_id 字段以支持嵌套文件夹。
 */
export const migration: Migration = {
  version: 7,
  name: "add_project_folder_parent_folder_id",
  up: (database) => {
    database.exec(`
      ALTER TABLE project_folder ADD COLUMN parent_folder_id TEXT REFERENCES project_folder(external_id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_project_folder_parent_folder_id ON project_folder(parent_folder_id);
    `)
  },
}
