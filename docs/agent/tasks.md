# Agent 与 Harness 继续实施任务文档（v2 一轮）

本文是"继续实行 agent 功能和 harness"的**任务文档**：依据参考项目 [pi-main]（`packages/agent/src/harness/` 与 `packages/coding-agent`）与 [opencode-dev]（`packages/opencode/src/`）的分析，结合 `docs/agent/` 现有四篇设计文档，确定本轮**实施范围、各能力设计、明确不做项与实施规范**。代码执行前需用户确认本文 §7 待确认决策清单。

参考的既有文档：核心架构见 [design.md](./design.md)，扩展体系见 [extensions.md](./extensions.md)，Harness 演进与信任模型见 [harness.md](./harness.md)，SQLite 落盘见 [database.md](./database.md)。

## 1. 背景与范围决策

现状（已由代码与文档核验）：Agent 核心（状态机 + loop + StreamFn）、九内置工具 + MCP + read_skill、权限三态模型、SQLite 三表持久化、标题生成、建议问题、12 个 IPC channel、完整 UI 渲染层均已实现。**代码中存在但未接线的休眠面**：`Agent.steer()/followUp()/continue()` 队列 API（loop 已接线，无 IPC/UI 消费）；`transformContext`/`shouldStopAfterTurn` 等 `AgentLoopConfig` hooks（runner 仅挂了 `beforeToolCall`）。

两个参考项目相对 lx-agent 的可移植资产，按价值/体量排序：

| 资产 | 参考源 | 现状 | 体量 |
|------|--------|------|------|
| 上下文 compaction（阈值 + overflow 自动压缩） | pi `compaction/` + opencode `session/compaction.ts` | 未做 | 大 |
| 子代理（task 工具委托子任务） | opencode `tool/task.ts` + pi `examples/extensions/subagent` | 未做 | 中 |
| 文件快照 / 回滚（git-tree 哈希） | opencode `snapshot/index.ts` | 未做 | 中 |
| continue / steer / followUp 接线 | pi `Agent.continue()` 后置续跑 | 代码已具备，仅差 IPC/UI | 小 |
| run 恢复（v3 操作日志） | pi durable harness | 未做 | 大 |
| fork / 分支 / refs | pi + opencode `Session.fork` | 未做 | 中 |
| MCP remote / skill 附带工具 / `/` 命令面板补全 | — | 留口 | 小-中 |

**范围决策（已确认）**：

| # | 能力 | 结论 |
|---|------|------|
| A | 上下文 compaction | **本轮做** |
| B | 子代理（task 工具） | **本轮做** |
| C | 文件快照与回滚 | **本轮做** |
| D | continue 接线 | **本轮做** |
| E | run 恢复（操作日志 / 断电续跑） | **不做**（见 §7 说明） |
| F | fork / 分支 / refs | **不做** |
| G | MCP remote / skill 附带工具集 / `/` 命令面板 / 流式中发送排队 | **不做，维持留口** |

**排序**：D → A → B → C。D 最小且为 A/B 提供后置续跑基座；A 最独立最复杂，放第二；B 触及工具与持久化，C 触及 deleteMessageTurn 与 git，收尾。

> 注意：本排序**调整了 [harness.md](./harness.md) §6 的演进路线**（原 v3=操作日志恢复、v4=compaction/refs）。因 compaction 是唯一能直接改善会话质量的能力，且 run 恢复在桌面场景低频，故 compaction 提前、run 恢复继续推迟。调整不影响既有接口。

## 2. D：continue 接线（先行）

现状：`Agent.continue()`/`steer()`/`followUp()` 与 `PendingMessageQueue` 全部实现并已接线到 loop（`getSteeringMessages`→`steeringQueue.drain()`、`getFollowUpMessages`→`followUpQueue.drain()`）；`agentRunner` 未暴露任何入口，renderer 无按钮。

对齐 pi 的 `_runAgentPrompt` 后置续跑循环（`agent-session.ts`）：`agent.prompt()` 完成后，循环 `_handlePostAgentRun()` 判断是否续跑——重试 / compaction / 队列消息任一为真则 `agent.continue()`。

**改动清单**：

| 位置 | 改动 |
|------|------|
| `src/main/agent/agentRunner.ts` | 新增 `continue()`：先 `agent.continue()` 对齐 pi 语义；若最后一条 assistant 的 stopReason ∈ {`length`, `aborted`} 且有文本内容，则 `agent.steer(续写指令)` 后再 `agent.continue()`（steer 消息注入后正常走事件流，作为可见 user 气泡，落库如实） |
| `src/shared/ipc/agentChannels.ts` | 新增 `agent:continue`（invoke，无参） |
| `src/main/ipc/agentHandlers.ts` | 薄转发 `agentRunner.continue()`；busy 时返回拒绝 |
| `src/preload/api/agent.ts` | 暴露 `agent.continue()` |
| renderer `useAgentChat.ts` | 新增 `continueChat()`；最后一条 assistant stopReason ∈ {`length`, `aborted`} 且无流式时置"可继续"态 |
| renderer `AgentMessageItem.tsx` | 可继续态时在建议问题区旁展示"继续生成"按钮 |

**边界**：
- 流式进行中调用 → busy 拒绝（复用现有语义）。
- 续跑产出的消息走既有事件流与落库，无需新事件类型。
- **不做**流式中发送排队（steer during streaming）——改 `send()` busy 语义，留口。

## 3. A：上下文 compaction

**目标**：会话上下文超过模型窗口时，将早期完整历史压缩为一条结构化摘要，模型上下文始终有界；UI 仍展示全量历史，DB 保留全量真相源（不破坏 [database.md](./database.md) 的"真相源"不变量）。

对齐 pi `compaction/compaction.ts`（cut-point + 增量摘要 + `compaction` entry + 可见摘要消息 + 全量真相源）与 opencode（`<conversation-checkpoint>` 注入、overflow 自动重试）。**采用方案 Z（可见摘要 + 全量 UI，已确认）**：压缩只发生在 LLM 上下文构造边界（`transformContext`），`state.messages` 全量保留（UI 全量历史可回看、DB 全量落盘）；摘要以带 `role: "compactionSummary"` 的**可见消息**注入 UI 与模型上下文（同一份），诚实地向用户标注"此处已压缩"，不伪装成 user 消息。

### 3.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 压缩数据模型 | **方案 Z（已确认）**：`state.messages` 保持全量（UI 全量历史、DB 全量落盘）；模型上下文经 `transformContext` 构造 `[compactionSummary 摘要消息] + firstKeptSeq 之后的尾部`；摘要以 `role: "compactionSummary"` 的**可见消息**注入 UI（专属非交互渲染块，标注"此处已压缩"），与模型上下文同一份；**不落 message entry**（compaction entry 的 payload 即摘要，避免双倍） |
| 2 | 边界存储 | 新 entry type `compaction`（`agent_session_entry.type` 已为自由文本，**无 schema 变更、无需迁移**）：payload = `{ summary, firstKeptSeq, tokensBefore }` |
| 3 | 触发时机 | **turn 结束后同步执行**（`send()` 内 `await agent.prompt()` 返回后）：估计全量上下文 token，超过阈值 → 生成摘要 → 追加 `compaction` entry → 更新 runner 边界。对齐 pi `_checkCompaction` → continue 语义；阻塞下一条消息数秒可接受 |
| 4 | 阈值 | 新增配置节点 `ai.compaction`（`~/.lx/config.json`）：`{ enabled?, contextWindow?, keepRecentTokens?, reserveTokens? }`，默认 `enabled: true / contextWindow: 128000 / keepRecentTokens: 20000 / reserveTokens: 16384`。触发条件 `estimatedTokens > contextWindow - reserveTokens`（对齐 pi `shouldCompact`） |
| 5 | token 估计 | 复用最后一条 assistant 的 `usage.totalTokens` 作锚点，其后消息按 `char/4` 启发式累加（对齐 pi `estimateContextTokens`）；不逐消息重估 |
| 6 | 切割点 | 从尾部向前累计估计 token 至 `keepRecentTokens` 预算满足；**只切在完整 turn 边界**（对齐 pi `findValidCutPoints`：不切在 toolResult 中间） |
| 7 | 摘要生成 | 裸 AI SDK `streamText`（复用 [design.md](./design.md) §10 titleGenerator 模式：单次生成、无工具、不进事件流、`AbortSignal.timeout(30s)`）；prompt 为结构化模板（目标 / 已完成 / 进行中 / 阻塞 / 关键决策 / 下一步），简体中文；失败静默保留旧边界，下轮再试 |
| 8 | 恢复一致性 | `restoreSession` 读取 `compaction` entry 重建边界与摘要消息；`state.messages` 仍全量加载（UI 全量），摘要消息作为可见消息随 `restoreSession` 返回重建；首轮 LLM 调用经 `transformContext` 压缩。`deleteMessageTurn` 按 seq 删除天然与边界兼容（seq 空洞不影响 `seq >= firstKeptSeq` 过滤） |
| 9 | 溢出重试 | provider 返回 context-overflow 错误时：**本轮做最小路径**——`aiSdkStreamFn` 识别 context-overflow 错误签名 → runner 在 turn 失败路径移除错误消息 → 强制压缩 → 自动重试一次（对齐 opencode `compactAfterOverflow`）。与阈值路径（决策 3）共享 `compactSession` 核心，仅增量 `isContextOverflowFailure` 判定 + 一次重试循环；重试后仍失败则停止（不无限重试） |

### 3.2 实现要点

- `agentRunner` 维护 `contextBoundary: { summary, firstKeptSeq, tokensBefore } | null` 与消息→seq 对齐：`flushTurn` 落库时记录本次 runMessages 的 seq 追加到 `messageSeqs[]`；`restoreSession` / `restoreMessages` 重建时按 `listEntries` 顺序配对重建。
- 消息模型：`src/shared/contracts/agent.ts` 的 `AgentMessage` union 新增 `CompactionSummaryMessage`（`role: "compactionSummary"`、`summary`、`tokensBefore`、`timestamp`）；renderer `toChatMessage` 映射 + 专属非交互块（不可编辑/删除，不触发建议问题，`isLastAssistant`/undo 定位等判断需排除该 role）。
- 可见性：压缩完成时经 `agent:event` 推送摘要消息（复用 `message_end`，message = CompactionSummaryMessage），renderer 插入为可见块；摘要**不落 message entry**，恢复时从 compaction entry 重建。
- `ensureReady()` 创建 Agent 时挂 `transformContext`：
  ```ts
  transformContext: async (messages) => {
    const boundary = this.contextBoundary
    if (!boundary) return messages
    const kept = messages.filter((_, i) => this.messageSeqs[i] >= boundary.firstKeptSeq)
    return [createCompactionSummaryMessage(boundary.summary, boundary.tokensBefore), ...kept]
  }
  ```
- 摘要生成器：`src/main/agent/compaction.ts`，导出 `estimateContextTokens(messages)` / `compactSession(messages, boundary)`（含切割点计算与摘要生成），供 runner 与测试调用。
- 阈值触发点：`send()` 的 `await agent.prompt()` 之后、返回前调用 `await this.compactIfNeeded()`；`flushTurn` 已保证消息落库，`compaction` entry 在独立事务追加。
- **overflow 触发点（决策 9）**：`aiSdkStreamFn` 在 provider error 事件中识别 context-overflow 签名（`isContextOverflowFailure`，输出 `stopReason: "error"` + 错误签名）；runner 捕获该错误 → 移除错误 assistant 消息（`state.messages` 尾部切片，不落库）→ `compactIfNeeded(force)` → 同一 prompt 重试一次 → 仍失败则返回错误。

## 4. B：子代理（task 工具）

**目标**：新增内置工具 `task`，让模型委托独立子任务（如并行搜索/探索/长命令），子代理在**同一 cwd** 内以**独立上下文**运行自己的工具循环，最终文本作为 `task` 工具的 toolResult 回灌父上下文。

对齐 opencode `tool/task.ts`（child session + permission 派生）与 pi `examples/extensions/subagent`（隔离上下文 + 结果回传），但**不引入子进程**：lx-agent 单进程 main，子代理 = 进程内嵌套 `Agent` 实例（复用既有 `Agent` 状态机与 `ToolRegistry`）。

### 4.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 工具形态 | 新增内置工具 `task`：`inputSchema = { description: string(1..500), prompt: string(1..4000) }`。`description` 供父模型判断何时委托；`prompt` 为委托任务文本 |
| 2 | 执行模型 | **进程内嵌套 `Agent`**：独立 systemPrompt（父系统提示词 + 子代理前缀"你是子代理，专注完成委托任务，完成后用简体中文总结结果"）、独立 messages（`[{ role:"user", content: prompt }]`）、复用父 `ToolRegistry` 激活集**去掉 `task` 自身**（防递归）与 `web_search`（可选，见 §7） |
| 3 | 权限 | `task` 工具自身进**门控集**（`GATED_BUILTIN_TOOLS` 加 `task`，弹窗确认后才 spawn）；子代理内部工具仍走同一 `permissionManager.gate`（复用 `currentSessionId`），不豁免 |
| 4 | 事件/进度 | 子代理事件**不单独发 IPC**：流式文本增量桥接到父 `task` 工具的 `onUpdate(partialResult)`，renderer 经既有 `tool_execution_update` 展示子代理进度（折叠于 `AgentToolCallBlock`） |
| 5 | 结果 | 子代理最终 assistant 文本 → toolResult content；`details` 记 `{ usage, messageCount }`（UI/审计，不进模型上下文） |
| 6 | 落库 | `agent_call` 记一行 `kind = "subagent"`（schema 已支持）、`name = "task"`、`args` = 截断的 `{description, prompt}`；**子代理内部工具调用 v1 不单独落库**（对齐 [database.md](./database.md) §2.3"子代理对父会话就是一次普通调用"，内部 provenance 留 v2） |
| 7 | 并发 | 并行来自父工具循环既有 `executionMode: "parallel"`：父模型一次批量发多个 `task` 调用即并发（无需单独并发控制） |
| 8 | 中止 | 子代理接收父 run 的 abort signal：父 signal abort → 子代理 `abort()` 级联；子代理自身挂起权限请求按拒绝处理（fail-safe 复用） |
| 9 | 成本/失控防线 | **不设轮数上限**，用"语义 + 可见 + 可中止"组合（对齐 pi 事件流 + opencode 子代理控制）：① `task` spawn 前权限确认（进门控集）；② 子代理内部工具复用父权限门控（门控集 + 会话记忆，不豁免）；③ 子代理事件经 `tool_execution_update` 流式回传，UI 实时可见进度（可见即可控）；④ 父 run abort 级联中止子代理；⑤ 子代理最终输出经 `truncate.ts` 有界回传，超限写 `tool-output` 文件，父上下文只收有界预览 + 路径标记（对齐 opencode Truncate.Service）；⑥ 子代理 system prompt 明示"完成即停，勿多余探索"，`terminate` 工具语义保留；⑦ 深度防线 = 子代理工具集排除 `task`，直接斩断递归嵌套 |

### 4.2 实现要点

- `src/main/agent/tools/task.ts`：`createTaskTool(ctx)`，`execute` 内构造嵌套 `Agent`（`streamFn` 复用 `createAiSdkStreamFn`、`beforeToolCall` 复用 `permissionManager.gate`、工具集 = `ctx.tools` 去 `task`），`await agent.prompt(prompt)`，返回 `{ content: [最终文本], details }`。
- 工具注册：`agentRunner.createRegistry` 注册 `task` 并进 `ALL_TOOL_NAMES`；嵌套 Agent 的工具集在 `execute` 时从注册表当前激活集派生（去掉 `task`）。
- 门控常量：`permissions/rule.ts` 的 `GATED_BUILTIN_TOOLS` 加 `task`。
- 系统提示词子代理前缀放 `task.ts` 内部（不改 `DEFAULT_SYSTEM_PROMPT`）。
- 结果有界化（决策 9-⑤）：子代理最终文本经 `truncate.ts` 截断回传；超 `DEFAULT_MAX_BYTES` 时写入 `{appData}/tool-output/` 文件，父上下文只收有界预览 + 文件路径标记。

## 5. C：文件快照与回滚

**目标**：对每个用户 turn 捕获 cwd 的 git 快照（tree hash），删除该轮对话时把**文件改动一并回滚**，使"删一轮"成为真正的撤销（现有 `deleteMessageTurn` 只删消息不回滚文件）。

对齐 opencode `snapshot/index.ts`：**隐藏 git 仓库**（每项目一份，object DB 经 alternates 复用真实仓库哈希，`--git-dir <hidden> --work-tree <cwd>`），`git add -A + write-tree` 得快照哈希，`read-tree/checkout-index` 或 `git checkout <hash> -- <file>` 回滚。

### 5.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 前置条件 | cwd 是 git 仓库才启用快照；否则 `deleteMessageTurn` 维持现状（仅删消息）。真实仓库的**隐藏快照库**（`{appData}/snapshots/{cwdHash}/`，alternates 指回真实 `.git/objects`），**不动用户 index/staging** |
| 2 | 捕获时机 | 每 turn 两次 `write-tree`：`send()` 开始时（`hash_start`）与 `flushTurn` 时（`hash_end`）。仅 cwd 是 git 仓库且存在隐藏库时执行；失败静默降级 |
| 3 | 存储 | 新表 `agent_snapshot`：`{ external_id, session_id, user_message_timestamp, hash_start, hash_end, files_changed, created_at }`。新表走 `createAgentTables` 的 `CREATE TABLE IF NOT EXISTS`（**无迁移**） |
| 4 | 回滚触发 | 复用 `deleteMessageTurn`：删除一轮时若有对应 `agent_snapshot` 行，按 `files_changed`（`git diff --name-only hash_start hash_end`）**选择性回滚**到 `hash_start`（`git checkout <hash> -- <file>` + 删除该轮新增文件），不碰其余文件 |
| 5 | 回滚范围 | **仅当被删轮是会话最后一条消息 turn** 时回滚文件；中段轮删除仍只删消息（避免与后续轮的文件/消息状态不一致，见 §5.2 风险） |
| 6 | 权限/审计 | 回滚属 main 进程文件操作，不重新弹权限（用户显式删除即授权）；快照捕获不进工具/模型上下文 |

### 5.2 风险与未决

- **中段轮文件回滚**：回滚中间轮会与后续轮消息引用的文件状态冲突，v1 限制"仅最后轮回滚文件"；完整 revert-and-cleanup（opencode 语义：回滚点之后的消息一并清理）留 v2。
- **快照捕获成本**：每 turn 两次 `git add -A + write-tree`，大仓库有成本；v1 接受（对齐 opencode），后续可加"仅含写工具调用时捕获"优化。
- 非 git 项目无快照能力（文档明示）。

## 6. 明确不做项及说明

| 项 | 说明 |
|----|------|
| **E. run 恢复（v3 操作日志）** | pi durable harness 的 `operation_started/generation_started/tool_started` 意图记录 + 崩溃续跑。桌面单进程、本地 SQLite、会话由用户主动恢复，无"断电续跑"真实场景；且恢复语义与 `flushTurn` 单事务落盘重叠。验收触发条件（对齐 [harness.md](./harness.md) §7）：出现长任务中断续跑的真实需求时启动 |
| **F. fork / 分支 / refs** | pi 的 Ref/branch 与 opencode `Session.fork`。桌面单会话 UI 无多分支需求；`agent_session_entry.parent_id` 已留空可配，数据模型无需改动，留口 |
| **G1. MCP remote / OAuth** | 需 token 存储 + 回调端口 + `needs_auth` 状态机，当前无 OAuth 基建（[extensions.md](./extensions.md) §6.5 留口维持） |
| **G2. skill 附带工具集** | pi 的 skill 可携带可选工具；v1 仅正文指令，`tools` 关联留口（[extensions.md](./extensions.md) §7.7 维持） |
| **G3. `/` 命令面板补全（`/skill:`、`/mcp status`）** | `_expandSkillCommand` 主进程展开已就位，renderer 补全为独立 UI 任务（[extensions.md](./extensions.md) §7.7 维持） |
| **G4. 流式中发送排队（steer during streaming）** | 改 `send()` busy 拒绝语义，风险高收益低，留口 |
| **G5. 永久 allow/deny 写回配置** | [harness.md](./harness.md) §4 明确不做，维持 |
| **G6. `bypassPermissions` 下 deny 特例保护** | [harness.md](./harness.md) §3.4 留口，维持 |

## 7. 决策清单（全部已确认）

范围 A+B+C+D（排除 E/F/G，见 §1/§6）；实施排序 **D → A → B → C**（§8）；compaction 数据模型 = **方案 Z**（可见摘要 + 全量 UI，§3.1 决策 1）；overflow 自动重试 = **本轮做最小路径**（§3.1 决策 9）；快照回滚范围 = **仅最后轮删除时回滚文件**（§5.1 决策 5）；B 子代理**不设轮数上限**、用"语义 + 可见 + 可中止"防线组合（§4.1 决策 9），子代理工具集 = 父激活集去 `task`（含 `web_search`）；D 续写指令 = **可见 user 气泡**落库（§2）；A 配置默认值 `contextWindow=128k / keepRecentTokens=20k / reserveTokens=16k`（§3.1 决策 4，可配，后续按实际模型窗口调整）。无待确认项。

## 8. 实施规范与验证

- **工作区**：确认后在 `.worktrees` 新建 worktree（命名 `时间戳-分支名`，如 `20260811-<feature>/`），在 worktree 内执行全部代码改动；完成 + 自测后询问用户是否合并回 `dev`。
- **IPC 三层契约**（channel 常量 / preload / main handler）同步更新（design.md §7 规范）。
- **精确校验**（仅受影响范围）：`pnpm typecheck` + Biome format 受影响文件；补 vitest 单测：`test/main/agent/`（compaction 切割点与 token 估计、task 工具嵌套 loop、continue 接线）、`test/main/db/`（agent_snapshot 表）、`test/main/services/`（deleteMessageTurn 回滚）。
- 完成检查：无遗留旧导入、无重复 DTO、无无用目录；改动不破坏既有四篇文档描述的接口。
