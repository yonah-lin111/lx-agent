# Agent 数据存储（SQLite）

Agent 会话落盘方案。存储框架为 `src/main/db/migrations/` 迁移器（`Migration = { version, name, up }`，启动时按 version 顺序应用），`0001_init.ts` 建立 Agent 相关四表；SQL 操作集中在 `src/main/services/agentSessionService.ts`，写入编排由 main 进程单写者 better-sqlite3 同步执行。

会话树（`agent_session_entry`）存完整会话上下文，是恢复/续接的**真相源**；`agent_call` 是工具调用的派生查询视图（审计/统计）；`agent_snapshot` 服务于删轮回滚。

相关文档：写入与治理行为见 [runtime.md](./runtime.md)；架构见 [architecture.md](./architecture.md)。

## 1. 设计决策

| # | 决策 | 结论 |
|---|------|------|
| 1 | 存储形态 | 混合：entry 树为真相源 + `agent_call` 独立视图表 |
| 2 | session 归属 | 全局会话，不按页面分桶；归属（project_item_id/project_id/page）建会话时**冻结**，仅作项目 tag 客户端筛选依据 |
| 3 | 调用记录 | 统一 `agent_call` + `kind` 四分类（builtin/mcp/subagent/skill）；子代理嵌套经 `parent_call_id` 同表自关联 |
| 4 | 能力快照 | 激活能力集随会话以 `active_capabilities` entry 冻结；config.json 仅作新建会话的默认装配源 |
| 5 | id 规范 | `id INTEGER PRIMARY KEY` + `external_id TEXT UNIQUE`（uuid 业务键）+ `created_at/updated_at`；FK 引用 external_id |
| 6 | 空会话不入库 | 新建对话仅内存态；首次发消息才 INSERT 会话行——空会话天然不可恢复 |
| 7 | 写入者 | main 单写者同步事务；每 turn 一个事务 |

## 2. 表结构

### 2.1 agent_session —— 会话元数据

| 列 | 说明 |
|----|------|
| external_id | uuid 业务键 |
| project_item_id / project_id / page | 建会话时冻结的归属；互斥 CHECK（item 会话或页面会话二选一） |
| title | 默认 'new chat'，AI 总结 ≤40 字符 |
| cwd | 工具执行目录，建会话时冻结（最近更新的 filesystem 项目目录，回退桌面路径） |
| created_at / updated_at | updated_at = 最后一次活跃（追加 entry 同事务 touch），历史列表按其倒序 |

索引：`(project_item_id, updated_at DESC)`、`(page, ...)`、`(project_id, ...)`。级联：随 `project_item` / `project` 删除。

### 2.2 agent_session_entry —— 会话上下文树（真相源）

| 列 | 说明 |
|----|------|
| session_id | → agent_session.external_id，CASCADE |
| seq | 会话内单调递增；UNIQUE(session_id, seq)；删轮保留空洞，nextSeq 取 MAX+1 |
| parent_id | 自引用树父（fork 重映射；多分支留口，v1 线性恒 NULL） |
| type / payload | 类型 + JSON 负载 |

entry type 约定：

| type | payload | 说明 |
|------|---------|------|
| `message` | `AgentMessage` 原样 | user / assistant（含 toolCall blocks）/ toolResult（含 diff?、subagent? 快照）；恢复续接的输入 |
| `active_capabilities` | `{ tools, mcp, skills }` | 能力快照，仅在能力集实际变化时追加；首条在创建事务内写入 |
| `todo` | `TodoList` | 追加型整表替换；恢复读最后一条；随轮删除回退 |
| `compaction` | `{ summary, firstKeptSeq, tokensBefore }` | 压缩边界；独立边界不随轮删除 |

### 2.3 agent_call —— 工具调用记录（查询/审计视图）

关键列：`session_id`、`entry_id`（触发该调用的 message entry，真相源↔视图互跳）、`parent_call_id`（自引用，子代理 provenance）、`kind`（CHECK：builtin/mcp/subagent/skill）、`name`（MCP 记前缀全名）、`mcp_server`（fullName→server 反查）、`status`（running/success/error/aborted）、`args/result`（截断 JSON）、`duration_ms`。

- **kind 分类**（按工具名判定）：`task`→subagent、`read_skill`→skill、∈已连接 MCP 全名→mcp（填 mcp_server）、其余 builtin。
- **subagent provenance**：子代理内部每次调用写同一张表同 session_id，`parent_call_id` 指向父 task 调用行的 external_id、`entry_id` 恒 null；任意深度成立，递归 CTE 查子树。
- 索引：session+started_at、kind、name、parent_call_id、entry_id。

### 2.4 agent_snapshot —— git 快照（删轮回滚）

`session_id` + `user_message_timestamp` 定位一轮；`hash_start/hash_end`（write-tree 哈希）+ `files_changed`（diff --name-only JSON）。仅 cwd 为 git 仓库时写入；删除最后一轮时按 files_changed 选择性回滚（见 runtime.md §3）；fork 时复制 ≤切割点时间戳的行到新会话。

## 3. 写入时机（turnStore.ts 编排）

```
send() 新会话 ──► createSessionIfNeeded：INSERT agent_session + 首条 active_capabilities entry（同事务）
                     └─ 触发标题生成（fire-and-forget）
beginTurn     ──► 缓冲本轮输入（binding/cwd/title/capabilities）
run 中        ──► tool_execution_start 缓冲 PendingCall（预生成 external_id 供子调用引用）
                   tool_execution_end 更新 status/result/duration
agent_end     ──► flushTurn 单事务：
                   ① 按 seq 追加本轮 message entries
                   ② INSERT 全部 agent_call 行（含子代理 child calls，parent_call_id 关联）
                   ③ pendingTodo 非空则追加 todo entry
                   ④ touchSession 同步 updated_at
压缩完成      ──► 独立事务追加 compaction entry
```

截断策略：`entry.payload` 存**完整**消息（恢复需要全量上下文）；`agent_call.args/result` 为查询视图，复用 truncate 常量截断（2000 行 / 50KB / 单行 500），全文在 payload 内。spill 文件（`~/.lx/spill/`）不入库，随会话删除级联清理。

## 4. 读取路径

- **历史列表**：全量 `ORDER BY updated_at DESC`，无归属过滤。
- **restoreSession**：entries 按 seq 升序重建 messages（损坏 entry 跳过）→ 最近 active_capabilities → MCP/skill 按当前配置重载 → compaction 边界与最后一条 todo 一并恢复。
- **fork**：复制 `seq < forkSeq` 的 entries（保持原 seq、重映射 parent_id/external_id）+ snapshots，同一事务（见 runtime.md §3）。
- **deleteMessageTurn**：区间删 entries + entry_id 关联的 calls，compaction 边界除外；删除后重读最后 todo 同步内存。

## 5. 演进路线

| 方向 | 触发条件 | 留口位点 |
|------|----------|----------|
| 会话全文搜索 | 历史面板标题搜索不够用时 | entries 结构支持 FTS5 影子表增量维护 |
| 项目删除保留会话审计 | 出现"删项目留会话"诉求 | 改软删/归档，评估 CASCADE 影响 |
