# 4. Session Tree 与 SQLite

## 4.1 目标

把当前内存 `chatHistoryStore` 替换为 SQLite 会话仓储，复刻 pi 的 append-only entry、active leaf、branch、fork、resume、tree navigation、compaction entry 和 JSONL 兼容导入导出。

## 4.2 文件归属

```text
src/main/agent/session/types.ts
src/main/agent/session/sessionRepository.ts
src/main/agent/session/sqliteSessionRepository.ts
src/main/agent/session/jsonlCodec.ts
src/main/agent/session/contextBuilder.ts
src/main/db/migrations/002_agent_sessions.ts
src/shared/agentSession.ts
```

迁移必须是独立文件，不修改 `createProjectTables` 或既有历史建表逻辑。

## 4.3 SQLite 表

建议 schema（字段名稳定，payload 版本化）：

```sql
agent_session (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  cwd TEXT NOT NULL,
  parent_session_id TEXT,
  active_leaf_id TEXT,
  name TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)

agent_session_entry (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  parent_id TEXT,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES agent_session(id) ON DELETE CASCADE,
  UNIQUE (session_id, sequence)
)

agent_session_label (
  session_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (session_id, entry_id, label)
)
```

索引：`(session_id, sequence)`、`(session_id, parent_id)`、`(session_id, type, sequence)`。所有 entry append、active leaf 更新和 materialized stats 在同一 SQLite transaction 中完成。

## 4.4 Entry 类型

当前实现必须覆盖：

- `session_header`：schema version、cwd、创建时间；
- `message`：`AgentMessage`；
- `model_change`、`thinking_level_change`、`active_tools_change`；
- `compaction`：summary、first kept entry、tokens before/after、usage；
- `branch_summary`：分支路径摘要和累计文件变更；
- `custom`、`custom_message`、`label`、`session_info`；
- `leaf`：active leaf 的持久变化，不能只留内存 cursor。

每个 payload 都带 `entryVersion`。未知类型在只读展示时可保留为 custom，但进入 model context 前必须被明确过滤或由 projector 转换。

## 4.5 Repository 接口

```ts
interface SessionRepository {
  create(input: CreateSessionInput): Promise<Session>
  open(sessionId: string): Promise<Session>
  list(query?: SessionListQuery): Promise<SessionSummary[]>
  append(sessionId: string, entry: SessionEntryInput): Promise<SessionEntry>
  readEntry(sessionId: string, entryId: string): Promise<SessionEntry | undefined>
  buildContext(sessionId: string, options?: ContextBuildOptions): Promise<AgentMessage[]>
  navigate(sessionId: string, entryId: string | null): Promise<void>
  fork(sessionId: string, selection: ForkSelection): Promise<Session>
  delete(sessionId: string): Promise<void>
  exportJsonl(sessionId: string): Promise<string>
  importJsonl(input: string, options?: ImportOptions): Promise<Session>
}
```

Runtime 只依赖该接口；SQLite 是当前唯一实现，memory repository 只用于测试。

## 4.6 分支和上下文

1. append 新 entry 时 parent 为当前 active leaf，并更新 leaf。
2. `buildContext` 从 active leaf 沿 parent 回溯，再按 compaction entry 和 projector 生成 model messages。
3. `navigateTree` 只移动 leaf，并可触发 branch summary；不能删除其他分支。
4. `fork` 在事务中复制选定 path 或 tree，并建立 `parent_session_id`；不会复制另一 session 的 harness runtime。
5. `resume` 先读取 session，再由 Runtime 根据 snapshot 重建 queues、model、tools 和 resources。

## 4.7 从当前实现迁移

- 删除 `chatHistoryStore` 作为真源；保留一个 feature-level selector 读取 main snapshot。
- `ChatSession.messages` 改为 session summary + lazy transcript，避免历史面板一次拉完整工具输出。
- 现有 Mock 会话只作为一次性 seed，不写入真实 session，或在 migration 中明确删除。
- `RightSideBar` 不再用 `key` 强制重挂载保存会话，改为 `sessionId` 与 runtime snapshot。

## 4.8 验收

- SQLite 重启后 session list、active leaf、branch、model/thinking/tools 配置和消息上下文一致。
- append 事务失败时没有半条 entry 或错误 leaf。
- fork、navigate、compact、export/import 与 pi session tests 的语义一致。
- 同一 session 的 append 通过串行队列；不同 session 可并行。
- JSONL 导入拒绝非法 header、重复 id、断裂 parent、未知版本和 malformed payload。

## 4.9 当前不实施

- 不实现 durable harness v2 的双日志、effect record、lane/ref sequence、writer lease 和 crash resume。
- 不做跨设备同步、云端 session、复制冲突合并。
