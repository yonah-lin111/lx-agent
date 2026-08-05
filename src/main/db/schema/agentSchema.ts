import type Database from "better-sqlite3"

/**
 * 创建 Agent 会话、上下文条目与调用记录数据表。
 * 会话树（agent_session_entry）存完整上下文，agent_call 存工具/MCP/subagent/skill 调用查询视图。
 */
export const createAgentTables = (database: Database.Database): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_session (
      id INTEGER PRIMARY KEY,
      external_id TEXT NOT NULL UNIQUE,
      project_item_id TEXT,
      project_id TEXT,
      page TEXT,
      title TEXT NOT NULL DEFAULT '新对话',
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
  `)
}
