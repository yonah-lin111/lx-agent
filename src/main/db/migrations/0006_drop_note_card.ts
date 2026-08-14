import type { Migration } from "./types"

/**
 * 移除笔记卡片功能：删除 note_card 表（含其索引），对应 0003 建表的反向迁移。
 */
export const migration: Migration = {
  version: 6,
  name: "drop_note_card",
  up: (database) => {
    database.exec(`
      DROP TABLE IF EXISTS note_card;
    `)
  },
}
