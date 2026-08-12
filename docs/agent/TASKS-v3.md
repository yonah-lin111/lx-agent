# Agent 与 Harness 继续实施任务文档（v3 一轮：fork + 权限收尾）

本文是"继续实行 agent 功能和 harness"的**任务文档 v3**。v2 一轮（A 上下文 compaction / B 子代理 / C 文件快照回滚 / D continue 接线）已全部落地（git `baeb911`）；本轮依据参考项目 [pi-main]（`packages/agent/src/harness/session/repository.ts` 的 fork 选择）与 [opencode-dev]（`packages/opencode/src/session/session.ts` 的 `Session.fork`）分析，确定本轮范围 = **fork/refs（主项）+ 权限收尾 G5/G6（附带）**，含明确不做项与实施规范。代码执行前需用户确认 §5 决策清单。

参考的既有文档：核心架构见 [design.md](./design.md)，扩展体系见 [extensions.md](./extensions.md)，Harness 演进与信任模型见 [harness.md](./harness.md)，SQLite 落盘见 [database.md](./database.md)。

## 1. 背景与范围决策

现状（已由代码核验）：

- v2 已落地：compaction（`src/main/agent/compaction.ts`）、子代理 task 工具（`tools/task.ts`）、git 快照回滚（`services/gitSnapshotService.ts` + `agent_snapshot` 表）、continue 接线；UI 侧子代理面板、git 工作区切换、状态栏已推进。
- fork 数据模型留口就绪：`agent_session_entry.parent_id`（第 47 行）、`agent_session.cwd`（第 16 行）均已存在；`agent_snapshot` 按 `(session_id, user_message_timestamp)` 定位；entry seq 按 `MAX(seq)+1` 生成（保持原始 seq 复制无冲突）；compaction boundary 从 `type='compaction'` entry 重建（`firstKeptSeq` 为绝对 seq）。
- renderer 的 tool call / 子代理展示数据来自 **entry payload 内的消息块**（`toolCall.subagent`），不依赖 `agent_call` 表（`agent_call` 是派生查询视图）——fork 复制无需复制 `agent_call`。

参考实现要点：

- opencode `Session.fork({ sessionID, messageID? })`：复制 `id >= messageID` 之前的所有消息 + parts 到新会话，重写 id / parentID 映射 / compaction `tail_start_id`，新标题 `xxx (fork #N)`（`getForkedTitle` 探测 `(fork #N)` 后缀递增）。
- pi `createSessionForkSelection`：`all`（无 entryId 全量）/ `through_entry`（position `at`）/ `before_user_message`（position `before`，目标必须是 user 消息，否则 `invalid_fork_target`）。

**范围决策（已确认）**：

| # | 能力 | 结论 |
|---|------|------|
| F | fork / 会话分支 | **本轮做** |
| C5 | G5 永久 allow/deny 写回配置 | **本轮做** |
| C6 | G6 bypass 下 deny 保护 | **本轮做** |
| E | run 恢复（v3 操作日志） | **不做**（维持 v2 决定） |
| G1/G2/G3/G4 | MCP remote / skill 附带工具 / `/` 命令面板补全 / 流式中发送排队 | **不做**（维持 v2 决定） |
| refs 多分支树 UI | 分支可视化、跨分支对比 | **不做，数据模型留口** |

## 2. F：fork / 会话分支

**目标**：支持从任意用户轮"从此分支"——复制该轮及之前的历史到新会话，切割点轮重写，源会话原样保留；新分支共享同一 cwd 与文件状态（快照可回滚）。

### 2.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 切割语义 | **从任意用户轮截断**：复制 `seq < forkSeq` 的 entry（forkSeq = 切割轮用户消息的 seq，不包含该轮，见 #2）；UI 在消息 hover 区提供"从此分支"入口；service 层 `forkSession(sessionId, forkSeq?)` 支持无 forkSeq 整会话复制（v1 UI 不暴露该入口，留口） |
| 2 | 包含语义 | 切割点**不包含该轮**（复制该轮之前历史，从该轮重写）——对齐 opencode `id >= messageID` break / pi `before_user_message` 读 target.parentId |
| 3 | UI 切换 | 创建后**自动切换**新会话，输入框留空直接重写（复用既有 `restoreChat` + `sessionListStore.refresh`） |
| 4 | compaction 交互 | 切割点 `seq < firstKeptSeq`（落压缩区）→ **拒绝** + 提示选择 `firstKeptSeq` 之后的轮；对齐 pi `invalid_fork_target` 拒绝语义 |
| 5 | snapshot 继承 | 复制 `user_message_timestamp <= 切割点轮` 的 `agent_snapshot` 行到新 session_id（新分支共享同一 cwd / git tree，hash 直接有效；`deleteMessageTurn` 回滚契约不因 fork 断掉） |
| 6 | seq 处理 | **保持原始 seq** 复制（compaction `firstKeptSeq` / `parent_id` 原样有效；新会话从 `MAX+1` 继续） |
| 7 | agent_call | **不复制**（renderer 展示依赖 entry payload；`agent_call` 是派生视图，复制反而重复） |
| 8 | cwd / 配置 | 继承源会话 `cwd`（`session.cwd` 原样复制）；模型选择随会话配置 |
| 9 | 命名 | `源标题 (fork #N)`，N 从 1 递增（对齐 opencode `getForkedTitle`） |
| 10 | busy / 流式 | 源会话 busy（流式 / 挂起权限请求）时拒绝 fork |
| 11 | 事务 | session + entry + snapshot 复制**同一事务**；失败整体回滚 |

### 2.2 实现要点

- **service 层**：`agentSessionService.forkSession(sessionId, forkSeq?)`——
  1. 读源 session（`cwd`、`title`），生成新 `external_id` + fork title。
  2. `SELECT * FROM agent_session_entry WHERE session_id = ? AND seq < forkSeq ORDER BY seq`（无 forkSeq 则全量）。
  3. 重写 entry `external_id`（`parent_id` 经 id 映射指向新 id）后 `INSERT` 新 session（保持 seq 原样）。
  4. 切割点定位：forkSeq 对应 entry 必须 `type='message'` 且 payload 内 role 为 `user`，否则拒绝（对齐 pi `invalid_fork_target`）。
  5. snapshot：`SELECT * FROM agent_snapshot WHERE session_id = ? AND user_message_timestamp <= 切割点轮 timestamp` → 重写 session_id 后 `INSERT`。
  6. 全部同一事务。
- **runner 层**：`agentRunner.forkSession(sessionId, userMessageTimestamp?)`——busy 拒绝；timestamp → 用户消息 entry seq（未命中 = 幽灵轮拒绝）；读 `type='compaction'` entry 得 `firstKeptSeq`，`forkSeq < firstKeptSeq` 拒绝；调用 service；返回新 session id。
- **IPC 三层**：`src/shared/ipc/agentChannels.ts` 新增 `agent:forkSession`（invoke，`(sessionId, userMessageTimestamp?)`——renderer 只掌握用户消息 timestamp，seq 由 runner 解析）→ `src/main/ipc/agentHandlers.ts` 薄转发 → `src/preload/api/agent.ts` 暴露。
- **renderer**：
  - `AgentMessageItem.tsx`：user 轮消息 hover 操作区新增"从此分支"按钮（assistant / toolResult 消息不显示；**仅当会话含 ≥2 个 QA 对时展示**——单对时切割点之前无历史，fork 无意义）。
  - `AgentPage`：`handleFork(userMessageTimestamp)` → `agentApi.forkSession` → 成功 `sessionListStore.refresh()` + `restoreChat(新 id)`；失败 toast 明示原因（compaction 区 / busy）。
  - 输入框留空（新会话初始无内容）。

## 3. 权限收尾（G5 + G6）

### 3.1 G6：bypass 下 deny 保护

现状：`permissionManager.evaluate()` 第 99 行 `if (mode === "bypassPermissions") return "allow"` 完全跳过规则（含 deny）；`gate()` 第 127 行 `sessionAllowAll.has(sessionId)` 短路同样跳过 deny。→ `.env` 等敏感文件在 bypass 模式下无保护。

**决策**：两个 bypass 入口都先查 deny。

- `evaluate()` 判定顺序改为：**先 `matchRule(deny)` → deny**，再 `mode === "bypassPermissions"` → allow，其后维持原判序。
- `gate()` 的 `sessionAllowAll` 短路：抽公共判定（deny 优先于 allowAll），使会话级"允许全部"下 deny 仍拦截。
- **同步更新 [harness.md](./harness.md) §3.3**："`bypassPermissions` 完全跳过权限系统（含 deny 与弹窗）"改为"deny 规则在 bypass 下仍生效（保护敏感路径），仅 allow 语义跳过"。

### 3.2 G5：永久 allow/deny 写回配置

现状：面板 4 选项（允许 / 允许本次会话 / 拒绝 / 允许全部）全内存态；`savePermissionSettings()` 已具备写回 `~/.lx/config.json` 能力。

**决策**：

| # | 决策 | 结论 |
|---|------|------|
| 1 | 面板选项 | 扩为：允许 / 允许本次会话 / **永久允许** / 拒绝 / **永久拒绝** / 允许全部 |
| 2 | 写回目标 | 永久允许 → `agent.permissions.allow[]` 追加 `Tool(args 原样)`；永久拒绝 → `deny[]` 追加 |
| 3 | allowAll 不写回 | 保持内存态（写回 = 改 `defaultMode=bypassPermissions`，与 G6 直接冲突、误触成本高） |
| 4 | 写回粒度 | **精确参数**原样写回（`Bash(git status --short)` / `Edit(src/a.ts)`），不做 `Tool()` 无参放大——换参数/换文件回到正常确认流 |
| 5 | 重载 | 写回后 `permissionManager.load()` 重载规则，设置页"权限"分区可见可删（复用既有 `getPermissionSettings` / `savePermissionSettings`） |

- `permissionManager.respond()` 增加持久化分支：响应带 `permanent: "allow" | "deny"` 标志时，调用 `settingsService.savePermissionSettings()` 追加规则（去重：同工具同参数已存在则跳过）+ `load()` 重载。
- renderer 面板：`onPermissionRespond` 传入新增决策；选中"永久允许/永久拒绝"后直接发送（无需二次确认，区别于 allowAll）。

## 4. 明确不做项及说明

| 项 | 说明 |
|----|------|
| **E. run 恢复（v3 操作日志）** | 维持 v2 决定；桌面单进程、无断电续跑真实场景（harness.md §7 触发条件未到） |
| **refs 多分支树 UI** | 分支可视化 / 跨分支对比不做；`parent_id` 留口维持，fork 已提供"从一个会话长出多个分支"能力 |
| **fork "包含该轮"选项** | 与整会话复制重叠，v1 不做（§2.1 决策 2） |
| **G1/G2/G3/G4** | MCP remote / skill 附带工具 / `/` 命令面板补全 / 流式中发送排队，维持 v2 决定 |

## 5. 决策清单（全部已确认）

- 范围 = fork（主）+ 权限收尾 G5/G6（附）；排除 E / refs 树 UI / G1–G4（§1）。
- fork：任意用户轮截断、不包含切割点、自动切换、compaction 区拒绝、继承 snapshot、保持 seq、不复制 agent_call、命名 `xxx (fork #N)`、busy 拒绝、同事务（§2.1 #1–11）。
- G6：全局 bypass 与会话级 allowAll 两入口都先查 deny；更新 harness.md §3.3 措辞（§3.1）。
- G5：面板新增永久允许/永久拒绝，精确参数写回 `allow[]`/`deny[]`，allowAll 不写回，写回后重载（§3.2）。

无待确认项。

## 6. 实施规范与验证

- **工作区**：确认后在 `.worktrees` 新建 worktree（命名 `时间戳-分支名`，如 `20260812-fork-permissions/`），在 worktree 内执行全部代码改动；完成 + 自测后询问用户是否合并回 `dev`。
- **IPC 三层契约**（channel 常量 / preload / main handler）同步更新（design.md §7 规范）。
- **精确校验**（仅受影响范围）：`pnpm typecheck` + Biome format 受影响文件；补 vitest 单测：
  - `test/main/services/`：`forkSession`（切割点复制、seq 保持、snapshot 继承、非 user 轮拒绝、compaction 区拒绝、同事务回滚）。
  - `test/main/agent/permissions/`：G6（bypass 模式 + allowAll 下 deny 仍拦截）、G5（永久写回 `allow[]`/`deny[]`、去重、allowAll 不写回）。
- 完成检查：无遗留旧导入、无重复 DTO、无无用目录；改动不破坏既有四篇文档描述的接口（harness.md §3.3 措辞更新除外）。
