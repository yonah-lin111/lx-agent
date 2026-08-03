# Harness 路线图与留口

本文说明首版 Agent 能力相对 pi durable harness 的取舍、留口位点与演进路线。pi 的 harness（`packages/agent/src/harness/`）是万行级 durable 系统，与"简单实现"矛盾，首版只移植 agent-core，harness 以概念映射 + 代码位点预留方式演进。

## 1. 概念映射（pi harness → 本项目现状）

| pi 概念 | 含义 | 本项目首版对应 | 状态 |
|---------|------|----------------|------|
| Session | 持久化对话日志（树 + 编排历史） | `chatHistoryStore`（内存级）+ main runner 会话上下文 | 内存级 |
| Harness | 驱动 run、队列、恢复的唯一写入者 | `agentRunner.ts`（会话级单例） | 单 run 串行 |
| Ref | 分支指针 + 串行化工作 | 无（单会话模型） | 不做 |
| Operation / Step | 一次接受 → 自动连续 | `agent.prompt()` / `continue()` | 已具备 |
| Checkpoint | 步骤间安全点（队列消费、延迟写） | 无（无并发写入方） | 不做 |
| 事件 / Hook | 被动观察 / 主动拦截 | `AgentEvent` + `AgentOptions` hooks（beforeToolCall/afterToolCall/transformContext/prepareNextTurn） | 已具备 |
| Snapshot | 原子状态捕获 | 无（IPC 事件驱动） | 不做 |
| 持久化后端 | SQLite / JSONL | 无 | 不做 |
| 恢复 / 崩溃续跑 | 从日志恢复挂起的 run | 无 | 不做 |

## 2. 首版明确不做（及理由）

- **SQLite 会话持久化**：会话历史落盘涉及消息序列化、断点语义，归 harness 阶段；首版内存 store 足够支撑单次会话体验。
- **run 恢复（resume）**：进程崩溃后恢复进行中的 run 需要操作日志（harness entries），复杂且低频。
- **refs / 多分支并行**：桌面单会话 UI 无此需求。
- **compaction / 上下文窗口管理**：首版全量上下文续接；超长上下文压缩（summary）属 harness 编排职责。
- **steer / followUp 队列**：`Agent` 已具备队列能力（移植代码自带），但 IPC/UI 未暴露；后续按需接线。

## 3. 留口位点（代码级）

首版实现必须保留以下扩展锚点，后续 harness 演进不破坏现有接口：

1. **会话上下文边界**：`agentRunner` 的"当前会话上下文"（messages + cwd + 模型）必须是**可替换对象**，接口为 `getMessages() / restoreMessages(messages)` —— 未来换成 `Session`（SQLite）时，runner 只换存储实现。
2. **消息模型可持久化**：`AgentMessage` 保持纯 JSON 可序列化（无函数、无 class 实例），保证未来 JSONL/SQLite 直接落盘；renderer 侧 `id` 由事件侧补充，不进模型。
3. **事件订阅已有**：`Agent.subscribe()` 即 pi harness 事件的前身；IPC 透传不改负载形状，harness 阶段新增事件类型不影响 renderer 订阅契约（renderer 按 type 分发，未知类型忽略）。
4. **hooks 位点已具备**：`beforeToolCall` / `afterToolCall` / `transformContext` / `prepareNextTurn` / `getSteeringMessages` / `getFollowUpMessages` 全部随移植代码保留——harness 的权限控制、上下文注入、延迟写都挂在这些位点上。
5. **工具执行与循环解耦**：`agent-loop` 执行工具（`executeToolCalls`），AI SDK 只做生成；harness 的 durable 工具记录（tool_started/resultEntryId）未来可包裹 `execute` 而不改 loop 结构。
6. **cwd/权限模型**：工具创建时注入 cwd，权限判定集中在 read 工具内部；未来信任模型（如逐次确认）挂 `beforeToolCall` 即可。

## 4. 演进路线

**v2 — Session 持久化**
- `chatHistoryStore` 换为 main 侧 SQLite Session（复用现有 `better-sqlite3` + drizzle 基础设施），消息 JSON 序列化落盘。
- renderer 历史面板改走 IPC 查询；恢复会话 = 读取消息 → `restoreMessages` → 全量上下文续接（首版续接逻辑原样复用）。
- 此阶段无 run 恢复：崩溃后会话仍在，进行中的 run 丢弃。

**v3 — 操作日志与恢复**
- 引入 harness entries（`operation_started` / `generation_started` / `tool_started` 意图记录），挂载点：`agent.prompt()` 入口、streamFn 调用前、工具执行前。
- `agentRunner` 增加恢复逻辑：检测未完成操作 → 重试或取消。

**v4 — refs / 多会话并行 / compaction**
- 按 pi 语义引入 Ref 与 Checkpoint；compaction 复用 `transformContext` 位点实现上下文截断 + summary 生成。

## 5. 验收标准（演进触发条件）

- v2：用户反馈"重启后历史丢失"为主要痛点时启动；或需要多窗口共享会话时。
- v3：有"断电续跑"真实场景（如长任务执行中断）时启动。
- v4：出现多分支需求（如 Slack/邮件多线程挂接）时启动。
