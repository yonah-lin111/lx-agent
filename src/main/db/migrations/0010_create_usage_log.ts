import type { Migration } from "./types"

/**
 * 新增 usage_log：每次模型请求一条记录，成本在写入时快照。
 * session_id / project_id 为快照字段，故意不建外键：会话删除不影响历史统计。
 */
export const migration: Migration = {
  version: 10,
  name: "create_usage_log",
  up: (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS usage_log (
        id INTEGER PRIMARY KEY,
        external_id TEXT NOT NULL UNIQUE,
        session_id TEXT,
        project_id TEXT,
        purpose TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        input_cost_usd REAL,
        output_cost_usd REAL,
        cache_read_cost_usd REAL,
        cache_write_cost_usd REAL,
        total_cost_usd REAL,
        duration_ms INTEGER,
        status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'aborted')),
        error_message TEXT,
        created_at TIMESTAMP NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_usage_log_created ON usage_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_usage_log_model ON usage_log(model);
      CREATE INDEX IF NOT EXISTS idx_usage_log_provider ON usage_log(provider);
      CREATE INDEX IF NOT EXISTS idx_usage_log_project ON usage_log(project_id);
    `)
  },
}
