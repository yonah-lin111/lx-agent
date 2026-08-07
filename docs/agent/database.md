# Agent 数据库表设计（SQLite）

本文定义 LX Agent Agent 能力的 SQLite 落盘方案。设计对齐参考项目 pi 的 `packages/storage/sqlite-node` + `harness/session` 的会话模型，并复用本项目 `src/main/db/` 现有表规范与 `harness.md` 的 v2 演进路线（"消息 JSON 序列化落盘 + restoreMessages 全量续接"）。

## 1. 设计约束与已确认决策

| # | 决策 | 结论 |
|---|------|------|
| 1 | 存储形态 | **混合**：`agent_session_entry` 树存完整会话上下文（恢复/续接的真相源），独立 `agent_call` 表存 tool/mcp/subagent/skill 调用记录（查询/统计/审计视图） |
| 2 | session 归属 | **全局会话**：不按页面/项目分桶。会话归属（`project_item_id`/`project_id`/`page`）在建会话时**冻结**，导航不改变既有会话；归属列仅作历史「项目/当前项目」tag 的筛选依据。`page` 列 + 可空 FK + CHECK 约束保留 |
| 3 | 调用记录 | 统一 `agent_call` 表 + `kind` 列（builtin/mcp/subagent/skill），subagent 嵌套用 `parent_call_id` 同表自关联表达 |
| 4 | 能力快照 | 激活能力集（tools/mcp/skills）作为 entry type `active_capabilities` 落盘随会话冻结；`config.json` 仅作**新建会话**的默认装配源 |
| 5 | id/时间规范 | 沿用现有规范：`id INTEGER PRIMARY KEY` + `external_id TEXT UNIQUE` + `created_at/updated_at TIMESTAMP`，FK 引用 `external_id` |
| 6 | 表管理 | 沿用 `exec("CREATE TABLE IF NOT EXISTS ...")`，新增 `createAgentTables`，与 `createProjectTables` 同风格同 `initDatabase` 入口；迁移框架写演进预案（见 §7） |
| 7 | 写入者 | main 进程单写者，better-sqlite3 同步，每次 run 内多条写包一个事务，无并发问题 |
| 8 | 空会话不入库 | 新建对话仅是内存态，**不 INSERT**；`agent_session` 在**首次发送消息**时才落库。未发消息的空会话无记录，不入库、不可恢复/列示（对齐 `chatHistoryStore` 对空消息直接 return 的语义） |

## 2. 表结构

### 2.1 agent_session —— 会话元数据

```sql
CREATE TABLE IF NOT EXISTS agent_session (
  id INTEGER PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,          -- uuid（业务键，供 FK 引用）
  project_item_id TEXT,                      -- 建会话时的项目 item 归属（冻结；历史「项目」tag 用）
  project_id TEXT,                           -- 冗余：项目 id（历史「项目/当前项目」tag 用）
  page TEXT,                                 -- 建会话时的页面路由（冻结；NULL = item 会话）
  title TEXT NOT NULL DEFAULT 'new chat',
  cwd TEXT NOT NULL,                         -- 工具执行目录（冻结：建会话时的项目路径/主目录）
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,             -- 每次追加 entry 时同步（全局最近活跃排序）

  -- 归属互斥：建会话时要么 item 会话要么页面会话（冻结后不变）
  CHECK ((project_item_id IS NOT NULL AND page IS NULL)
      OR (project_item_id IS NULL AND page IS NOT NULL)),
  -- item 会话必有所属项目
  CHECK (project_item_id IS NULL OR project_id IS NOT NULL),

  FOREIGN KEY (project_item_id) REFERENCES project_item(external_id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES project(external_id) ON DELETE CASCADE
);

-- 历史列表按全局最近活跃排序（不按归属分桶）；以下索引为「项目/当前项目」tag 扩展留口。
CREATE INDEX IF NOT EXISTS idx_agent_session_item
  ON agent_session(project_item_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_session_page
  ON agent_session(page, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_session_project
  ON agent_session(project_id, updated_at DESC);
```

- **全局会话**：会话不按页面/项目分桶，历史列表返回全量 `ORDER BY updated_at DESC`；归属列仅作「项目/当前项目」tag 的**客户端筛选**依据。
- 归属冻结：建会话时由当时导航上下文决定（有 item → item 会话；否则页面会话），导航不再改变既有会话的归属与 cwd。
- `updated_at` 语义 = "最后一次活跃"，由追加 entry 的同一事务同步更新；启动恢复 = 全量 `ORDER BY updated_at DESC LIMIT 1`。

### 2.2 agent_session_entry —— 会话上下文树（真相源）

```sql
CREATE TABLE IF NOT EXISTS agent_session_entry (
  id INTEGER PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,          -- uuid（供 agent_call.entry_id / 未来 ref 引用）
  session_id TEXT NOT NULL,                  -- → agent_session.external_id
  seq INTEGER NOT NULL,                      -- 会话内单调递增（追加序，等价 pi entry_seq）
  parent_id TEXT,                            -- 树父（首版线性恒 NULL；为 harness v3 refs/compaction 预留）
  type TEXT NOT NULL,                        -- message | active_capabilities | …
  payload TEXT NOT NULL,                     -- JSON（AgentMessage / 能力快照）
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
```

**entry type 约定（v1）**

| type | payload（JSON） | 说明 |
|------|----------------|------|
| `message` | `AgentMessage` 原样 | 纯 JSON 可序列化（harness.md §3.2 保证），含 text/thinking/toolCall/toolResult content blocks，是恢复续接的输入 |
| `active_capabilities` | `{ tools: string[]; mcp: string[]; skills: string[] }` | 能力快照，随会话冻结；对齐 pi `active_tools_change` |

首版会话在**创建事务**内写入首条 `active_capabilities`，其后每次 turn 追加消息；`active_capabilities` 仅在能力集实际变化时追加。`compaction / label / leaf / branch_summary / custom` 等 pi entry type 为 harness v3/v4 预留，v1 不写。

### 2.3 agent_call —— 调用记录（查询/审计视图）

```sql
CREATE TABLE IF NOT EXISTS agent_call (
  id INTEGER PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,          -- uuid
  session_id TEXT NOT NULL,                  -- → agent_session.external_id
  entry_id TEXT,                             -- 触发该调用的 message entry（真相源 ↔ 视图互跳）
  parent_call_id TEXT,                       -- subagent 嵌套：父调用 = 子代理那行；顶层为 NULL
  kind TEXT NOT NULL
    CHECK (kind IN ('builtin', 'mcp', 'subagent', 'skill')),
  name TEXT NOT NULL,                        -- builtin:'read' / mcp:'srv.read' / subagent:角色名 / skill:id
  mcp_server TEXT,                           -- kind='mcp' 时的 server 名（stdio server id）
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'error', 'aborted')),
  args TEXT,                                 -- JSON（参数摘要；截断见 §5）
  result TEXT,                               -- JSON（结果摘要/截断）
  duration_ms INTEGER,                       -- finished_at - started_at
  details TEXT,                              -- JSON 兜底（未来字段，如 MCP server 元信息）
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
```

**subagent 嵌套调用（§问题4的机制落表）**：子代理对父会话就是一次普通调用（`kind='subagent'`），其内部每个 tool/mcp/skill 调用**写同一张表、同一 `session_id`**，`parent_call_id` 指回子代理那行；任意深度自然成立。

- 查询子树：递归 CTE 沿 `parent_call_id` 遍历（深度 ≤3，无性能顾虑）；顶层 = `parent_call_id IS NULL`。
- context 不污染：子代理内部消息**不进父会话 entries 树**，父树只落一个 toolCall/toolResult 对（子代理对外暴露成工具）；内部步骤仅靠 `agent_call` 留存 provenance。
- 双向互跳：`entry_id` 从查询视图跳到上下文真相，反向由 message entry 内 toolCall block 的 id 对回调用行。

## 3. 能力装配：全量默认（不再按页面裁剪）

**能力不区分页面/项目会话**：所有会话一律内置工具全集 + 全部已连接 MCP 工具 + 全部可用 skill。`config.json` **不再有 `agent.pages` 节点**（能力按页面裁剪概念移除），`agent` 节点仅保留 `mcp` server 配置：

```jsonc
{
  "ai": { /* 现有模型 provider 配置不变 */ },
  "agent": {
    "mcp": { /* MCP server 配置（见 mcp.md） */ }
  }
}
```

- 能力快照：`active_capabilities` entry 仍随会话落库（恢复时按快照重建工具集）；装配时默认能力集 = `capabilityService.getDefaultCapabilities()`（全量内置工具），MCP/skill 由 runner 从管理器**全量**装配。
- `cwd`：建会话时冻结（item 会话 = 项目路径；页面会话 = `os.homedir()`）；恢复会话沿用快照 `cwd`。

## 4. 数据流与写入时机

**新建对话（不落库）**：renderer 新建对话仅置内存态；此时**不 INSERT `agent_session`**。空会话在表内无任何记录——天然不可能被恢复或被历史列表选中。

**首次发送消息（会话入库，一个事务）**
1. `INSERT agent_session`（归属键、cwd；title 由首条用户消息生成，对齐 `chatHistoryStore.createTitle`）
2. 追加 `active_capabilities` entry（此刻解析 config 的默认能力集）
3. 追加用户 `message` entry
4. 同步 `agent_session.updated_at`

**一次 turn**（一个事务）
1. 追加用户 `message` entry
2. LLM 流式生成 → 追加 assistant `message` entry（含 toolCall blocks）
3. 每执行一个调用：`INSERT agent_call(status='running')` → 完成时同事务/同 run `UPDATE` status + result + duration
4. 工具结果回灌 → 追加 `toolResult` message entry
5. 同步 `agent_session.updated_at`

**恢复会话**
1. 历史列表：全量 `SELECT * FROM agent_session ORDER BY updated_at DESC`（无归属过滤）；应用启动/进入时恢复其中**最近活跃**的一个
2. 读 entries 按 `seq` 升序 → 重建 `AgentMessage[]` → `restoreMessages`（harness v1 续接逻辑原样复用）
3. 取最近 `active_capabilities` 快照 → 重建 ToolRegistry 激活集（全量默认）

**会话重命名**（一个事务）：`UPDATE agent_session SET title=?, updated_at=? WHERE external_id=?`

**会话删除**（一个事务，显式顺序保证 `agent_call.entry_id` 无级联下 FK 不冲突）
1. `DELETE agent_call WHERE session_id=?`
2. `DELETE agent_session_entry WHERE session_id=?`
3. `DELETE agent_session WHERE external_id=?`

**删除一轮对话**（一个事务）：以该轮用户消息 `timestamp` 定位其 `message` entry，删除它到下一个用户消息（不含）之间的全部 entry，及 `entry_id` 落在其内的 `agent_call` 行。删除后会话无剩余消息则连会话行一并删除（维持"空会话不入库"）。`seq` 保留空洞不重排，`nextSeq` 取 `MAX(seq)+1` 不受影响。

写入均由 main 进程 better-sqlite3 同步执行，单写者，无锁冲突。

## 5. 落盘内容与截断

- `agent_session_entry.payload` 存**完整** AgentMessage（恢复需要全量上下文）；单个内容块遵循 `AgentMessage` 序列化上限。
- `agent_call.args/result` 为**查询视图**，复用 `truncate.ts` 常量（`DEFAULT_MAX_LINES=2000` / `DEFAULT_MAX_BYTES=50KB` / 单行 500）截断存储，完整内容在对应 entry 的 payload 内。

## 6. 与现有模块的接线（实现阶段）

| 位置 | 改动 |
|------|------|
| `src/main/db/schema/agentSchema.ts` | 新增 `createAgentTables(db)`，三表 + 索引 |
| `src/main/db/connection.ts` | `initDatabase` 内 `createProjectTables` 之后调用 |
| `src/main/agent/agentRunner.ts` | 会话创建/追加/恢复的持久化落点（替换 renderer 内存 `chatHistoryStore`） |
| `src/main/services/capabilityService.ts` | 收敛为单一**全量默认能力集**（移除 `agent.pages` 读取） |
| IPC / preload | 会话列表查询、恢复加载 channel（`agent:listSessions` / `agent:restoreSession`；`listSessions` 不再带 filter） |
| `RightSidebar.tsx` → `ChatHistoryPanel` | 透传 `currentProjectId` 与项目列表（历史「项目/当前项目」tag） |

## 7. 迁移机制演进预案（首版不实现）

首版沿用 `exec("CREATE TABLE IF NOT EXISTS ...")`，与 `createProjectTables` 同风格：schema 变更 = 在 `createAgentTables` 中追加 CREATE/ALTER 语句。

**引入迁移框架的触发条件**（满足任一即评估，对齐 pi `applyMigrations`）：
1. 出现首例**对既有数据的 ALTER**（新加列带默认值/回填）——IF NOT EXISTS 模式无法表达"只跑一次"的变更；
2. MCP / skill 调用表从占位进入定型（需要多轮演进）；
3. harness v3 run 恢复落地（entries 语义变更跨版本）。

**届时形态**（对齐 pi `packages/storage/sqlite-node`）：
- `migrations(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)` 表 + 编号 SQL 文件（`001_*.sql`…），启动时 `applyMigrations` 顺序应用、事务包裹；
- 现有三表 schema 回填为 `001_initial.sql`；
- `createAgentTables` 移除，统一走迁移器（`createProjectTables` 保持现状，避免误伤）。

## 8. 风险与未决

| 项 | 说明 |
|----|------|
| 级联删除 | `agent_session → entries/calls` 全随 `project_item` 级联删除。若后续要"项目删除但保留会话审计"，需改软删/归档，届时再评估 |
| 同 session 并发 append | v1 单会话单 runner（busy 拒绝），无双写者；多窗口共写同一 session 属 harness 后续关注 |
| 敏感数据 | `args/result` 可能含敏感内容，本地单机库明文接受（与 config.json 存 apiKey 一致）；不加密 |
| cwd 冗余 | `agent_session.cwd` 复制自 `project.path`，恢复不依赖 project 表存在；项目改名/移动路径后旧会话 cwd 可能失效，属可接受 |
