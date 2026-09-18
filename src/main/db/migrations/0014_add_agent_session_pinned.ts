import type { Migration } from "./types"

/**
 * 为 agent_session 表增加 pinned 字段，已存在记录默认未置顶（0）。
 */
export const migration: Migration = {
  version: 14,
  name: "add_agent_session_pinned",
  up: (database) => {
    database.exec(`
      ALTER TABLE agent_session ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
    `)
  },
}
