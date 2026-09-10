import type { Migration } from "./types"

/**
 * 为 project 表增加 is_imported 字段，已存在记录默认视为已导入（1）。
 */
export const migration: Migration = {
  version: 9,
  name: "add_project_is_imported",
  up: (database) => {
    database.exec(`
      ALTER TABLE project ADD COLUMN is_imported INTEGER NOT NULL DEFAULT 1;
    `)
  },
}
