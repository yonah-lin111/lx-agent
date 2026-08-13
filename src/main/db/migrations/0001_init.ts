import type { Migration } from "./types"

/**
 * 初始建表：项目、文件夹、条目与 Agent 会话相关表。
 * 迁移系统启用时的 schema 快照，此时 project_item 仍含 sort_order，由后续迁移移除。
 */
export const migration: Migration = {
  version: 1,
  name: "init",
  up: (database) => {
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
        enabled_folder_paths TEXT NOT NULL DEFAULT '[]',
        worktree_path TEXT,
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        FOREIGN KEY (project_id) REFERENCES project(external_id) ON DELETE CASCADE,
        FOREIGN KEY (project_folder_id) REFERENCES project_folder(external_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_project_item_project_id ON project_item(project_id);
      CREATE INDEX IF NOT EXISTS idx_project_item_folder_id ON project_item(project_folder_id);

      CREATE TABLE IF NOT EXISTS agent_session (
        id INTEGER PRIMARY KEY,
        external_id TEXT NOT NULL UNIQUE,
        project_item_id TEXT,
        project_id TEXT,
        page TEXT,
        title TEXT NOT NULL DEFAULT 'new chat',
        cwd TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,

        CHECK ((project_item_id IS NOT NULL AND page IS NULL)
            OR (project_item_id IS NULL AND page IS NOT NULL)),
        CHECK (project_item_id IS NULL OR project_id IS NOT NULL),

        FOREIGN KEY (project_item_id) REFERENCES project_item(external_id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES project(external_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_agent_session_item
        ON agent_session(project_item_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_session_page
        ON agent_session(page, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_session_project
        ON agent_session(project_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS agent_session_entry (
        id INTEGER PRIMARY KEY,
        external_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        parent_id TEXT,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,

        UNIQUE (session_id, seq),
        FOREIGN KEY (session_id) REFERENCES agent_session(external_id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES agent_session_entry(external_id)
      );

      CREATE INDEX IF NOT EXISTS idx_agent_session_entry_session_seq
        ON agent_session_entry(session_id, seq);
      CREATE INDEX IF NOT EXISTS idx_agent_session_entry_type
        ON agent_session_entry(session_id, type);
      CREATE INDEX IF NOT EXISTS idx_agent_session_entry_parent
        ON agent_session_entry(session_id, parent_id);

      CREATE TABLE IF NOT EXISTS agent_call (
        id INTEGER PRIMARY KEY,
        external_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        entry_id TEXT,
        parent_call_id TEXT,
        kind TEXT NOT NULL
          CHECK (kind IN ('builtin', 'mcp', 'subagent', 'skill')),
        name TEXT NOT NULL,
        mcp_server TEXT,
        status TEXT NOT NULL DEFAULT 'running'
          CHECK (status IN ('running', 'success', 'error', 'aborted')),
        args TEXT,
        result TEXT,
        duration_ms INTEGER,
        details TEXT,
        started_at TIMESTAMP NOT NULL,
        finished_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,

        FOREIGN KEY (session_id) REFERENCES agent_session(external_id) ON DELETE CASCADE,
        FOREIGN KEY (entry_id) REFERENCES agent_session_entry(external_id),
        FOREIGN KEY (parent_call_id) REFERENCES agent_call(external_id)
      );

      CREATE INDEX IF NOT EXISTS idx_agent_call_session
        ON agent_call(session_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_call_kind
        ON agent_call(kind);
      CREATE INDEX IF NOT EXISTS idx_agent_call_name
        ON agent_call(name);
      CREATE INDEX IF NOT EXISTS idx_agent_call_parent
        ON agent_call(parent_call_id);
      CREATE INDEX IF NOT EXISTS idx_agent_call_entry
        ON agent_call(entry_id);

      CREATE TABLE IF NOT EXISTS agent_snapshot (
        id INTEGER PRIMARY KEY,
        external_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        user_message_timestamp INTEGER NOT NULL,
        hash_start TEXT NOT NULL,
        hash_end TEXT NOT NULL,
        files_changed TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,

        FOREIGN KEY (session_id) REFERENCES agent_session(external_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_agent_snapshot_session
        ON agent_snapshot(session_id, user_message_timestamp);
    `)
  },
}
