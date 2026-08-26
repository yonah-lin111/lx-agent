import type { Migration } from "./types"

/**
 * 移除 agent_session 的 project_item_id 字段及约束，
 * 会话归属仅需绑定 project_id 与 page。
 */
export const migration: Migration = {
  version: 8,
  name: "remove_agent_session_project_item_id",
  up: (database) => {
    database.pragma("foreign_keys = OFF")

    database.exec(`
      CREATE TABLE IF NOT EXISTS agent_session_new (
        id INTEGER PRIMARY KEY,
        external_id TEXT NOT NULL UNIQUE,
        project_id TEXT,
        page TEXT,
        title TEXT NOT NULL DEFAULT 'new chat',
        cwd TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        FOREIGN KEY (project_id) REFERENCES project(external_id) ON DELETE CASCADE
      );

      INSERT INTO agent_session_new (id, external_id, project_id, page, title, cwd, created_at, updated_at)
      SELECT id, external_id, project_id, page, title, cwd, created_at, updated_at FROM agent_session;

      DROP TABLE agent_session;
      ALTER TABLE agent_session_new RENAME TO agent_session;

      DROP INDEX IF EXISTS idx_agent_session_item;
      CREATE INDEX IF NOT EXISTS idx_agent_session_page ON agent_session(page, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_session_project ON agent_session(project_id, updated_at DESC);
    `)

    database.pragma("foreign_keys = ON")
  },
}
