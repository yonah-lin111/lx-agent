import type { Migration } from "./types"

/**
 * 新增笔记卡片表：标题、Markdown 内容与标签，供头部笔记卡片功能使用。
 */
export const migration: Migration = {
  version: 3,
  name: "create_note_card",
  up: (database) => {
    database.exec(`
      CREATE TABLE note_card (
        id INTEGER PRIMARY KEY,
        external_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE INDEX idx_note_card_updated_at ON note_card(updated_at DESC);
    `)
  },
}
