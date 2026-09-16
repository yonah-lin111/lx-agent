import type { Migration } from "./types"

/**
 * 新增 schedule_item：用户日程条目，按本地日期（YYYY-MM-DD）归档。
 * completed_date 记录完成发生的本地日期，供趋势统计使用，避免依赖 UTC 时间戳换算。
 */
export const migration: Migration = {
  version: 11,
  name: "create_schedule_item",
  up: (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schedule_item (
        id INTEGER PRIMARY KEY,
        entry_date TEXT NOT NULL,
        content TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'P1' CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
        completed INTEGER NOT NULL DEFAULT 0,
        completed_date TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_schedule_item_entry ON schedule_item(entry_date, sort_order);
      CREATE INDEX IF NOT EXISTS idx_schedule_item_completed_date ON schedule_item(completed_date);
    `)
  },
}
