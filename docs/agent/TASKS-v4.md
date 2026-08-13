# Agent 与 Harness 继续实施任务文档（v4 一轮：todo 清单 + 调用记录收尾）

本文是"继续实行 agent 功能和 harness"的**任务文档 v4**。v3 一轮（fork + 权限收尾 G5/G6）已落地合并（git `b55af8d`）；本轮依据参考项目 [opencode-dev]（`packages/opencode/src/tool/todo.ts` + `session/todo.ts` 的 todowrite 整表替换与 TodoTable 覆盖写）与 [pi-main]（`agent_call` 无对应——引用 [database.md](./database.md) §2.3 预留的 `kind`/`parent_call_id`）分析，确定本轮范围 = **todo 清单（主）+ agent_call 调用记录收尾（附：kind 区分 + 子代理 provenance）**，含明确不做项与实施规范。代码执行前需用户确认本文 §6 决策清单。

参考的既有文档：核心架构见 [design.md](./design.md)，扩展体系见 [extensions.md](./extensions.md)，Harness 演进与信任模型见 [harness.md](./harness.md)，SQLite 落盘见 [database.md](./database.md)。

## 1. 背景与范围决策

现状（已由代码核验）：

- v1–v3 已落地：Agent 核心、9 内置工具 + MCP + read_skill、权限三态（含 G5 永久写回 / G6 deny 保护）、SQLite 会话树、compaction、task 子代理 + 独立面板、git 快照回滚、continue、fork。
- `agentRunner.flushTurn` 落 `agent_call` 时 `kind` 仅区分 `task → subagent`、其余恒 `builtin`，`parentCallId` 恒 `null`；子代理**内部**工具调用不落库（database.md §2.3 预留 `kind` 枚举 + `parent_call_id` 自关联，未启用）。
- 事件契约：`AgentEvent` union（`shared/contracts/agent.ts`）已有 `mcp_status_changed` / `permission_request` / `compaction_summary` 独立事件先例；`AgentRestoredSession` = `{ messages, activeCapabilities }`。

参考实现要点：

- opencode `todowrite`：**单一工具、整表替换**（模型每次传完整 `todos` 数组，非增量 add/update）；专用 `TodoTable`（DELETE+INSERT 覆盖）；UI 为 composer 上方 `SessionTodoDock`（折叠态一条当前项 + 进度 `done/total`，点击展开完整列表）；工具执行经 `ctx.ask` 门控。
- Claude Code todo 语义：**多步任务自动建清单**，状态四态 `pending / in_progress / completed / cancelled`，每轮向上下文注入 `[Todo #N ...]` 摘要保持模型跨轮同步。
- pi `sqlite/search-backend.ts`（FTS5 trigram 会话全文搜索）——本轮不搬，留口。

**范围决策（已确认）**：

| # | 能力 | 结论 |
|---|------|------|
| T | todo 清单（工具 + 落库 + UI dock + 上下文注入） | **本轮做（主）** |
| K | `agent_call.kind` 区分（mcp / subagent / skill / builtin） | **本轮做（附）** |
| P | 子代理 provenance 落库（`parent_call_id` 启用） | **本轮做（附）** |
| S | 会话全文搜索（pi FTS5） | **不做** |
| Q | question 工具（模型执行中向用户提问） | **不做** |
| E | run 恢复（v3 操作日志） | **不做**（维持 v2/v3 决定） |
| G1/G2/G3/G4 | MCP remote / skill 附带工具 / `/` 命令面板补全 / 流式中发送排队 | **不做**（维持） |
| refs 多分支树 UI | 分支可视化、跨分支对比 | **不做，数据模型留口** |

## 2. T：todo 清单

**目标**：模型在会话中维护一份任务清单，UI 以 dock 实时展示当前项与进度，模型上下文每轮可见，使多步任务可跟踪。

### 2.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 数据模型 | `TodoItem = { content: string, status: TodoStatus }`，`TodoStatus = "pending" \| "in_progress" \| "completed" \| "cancelled"`（对齐 CC 四态）；`TodoList = TodoItem[]` |
| 2 | 落库形态 | **追加型 entry `type='todo'`**（`agent_session_entry.type` 已为自由文本，**无 schema 变更**）；payload = `JSON(TodoList)`（**整表替换语义**，对齐 opencode todowrite）；恢复/重建读**最后一条** todo entry。零新表；fork 复制 entries 天然携带 todo；`deleteMessageTurn` 删区间 entry 天然回滚 |
| 3 | 工具形态 | 内置工具 `todowrite`：`inputSchema = { todos: TodoItem[] }`（模型每次传完整清单）；`execute` 返回 `{ content: [摘要文本], details: { todos } }`——**工具不碰持久化**，清单由 runner 在 `tool_execution_end` 解析落地 |
| 4 | 权限 | `todowrite` **不进门控集**（纯会话状态，无文件/网络副作用，对齐 `time`/`read_skill` 免询问） |
| 5 | 触发 | **自动建（对齐 CC）**：`DEFAULT_SYSTEM_PROMPT` 追加指引——"面对多步骤任务（≥2 步、需工具调用）自动用 todowrite 建清单并随进度更新；单步/闲聊不建" |
| 6 | 上下文可见性 | `transformContext` 每轮在 todoList 非空时注入一条 `role: "todoState"` 消息（`{ todos }`）→ `defaultConvertToLlm` 映射为带 `[任务清单]` 标记的 user 文本（复用 `compactionSummary` 先例）；**不进入 `state.messages`**（不落库、不渲染，UI 走独立 dock） |
| 7 | 事件契约 | 新增 `AgentEvent` 变体 `{ type: "todo_updated"; todos: TodoList }`；runner 在 `handleEvent` 捕获 `tool_execution_end(toolName==='todowrite')` 时解析 `event.result.details.todos` → 更新内存 `todoList` + `pendingTodo` → 经既有 `agent:event` 通道推送；**无新 IPC channel** |
| 8 | 恢复 | `agent:restoreSession` 响应新增 `todos: TodoList`（`readSessionEntries` 跟踪最后一条 todo entry）；`restoreMessages(空)` / `deleteSession` 清空内存 |
| 9 | 与 fork/删轮交互 | fork：entry 复制携带 todo，恢复自动落到最后一条；`deleteMessageTurn` 删除区间后**重读最后一条 todo entry** 同步内存（删除区间可能带走最新 todo） |
| 10 | UI 形态 | **`TodoDock` 组件**渲染于 `AgentPage` 的 `AgentInput` 上方（文档流内固定行，参考 `PermissionRequestPanel` 折叠态"单行 + 点击展开"逻辑，但**不独占键盘、非浮层**）：默认折叠 = **一行当前项**（`in_progress` 优先 → 首个 `pending` → 最后 `completed`）+ 状态标注（待办 / 进行中 / 已完成，cancelled 按已完成划线）；**点击行展开完整清单**（checkbox + 划线样式）；状态色 pending 灰 / in_progress 高亮脉冲 / completed 划线 |
| 11 | 渲染映射 | `useAgentChat` 新增 `todos` 状态：订阅 `todo_updated` 更新、`restoreSession` 提取；`AgentPage` 传给 `TodoDock`；无 todo（空数组）时 dock 不渲染 |

### 2.2 实现要点

- **contracts**（`src/shared/contracts/agent.ts`）：新增 `TodoStatus` / `TodoItem` / `TodoList`；`AgentEvent` union 加 `{ type: "todo_updated"; todos: TodoList }`；`AgentRestoredSession` 加 `todos: TodoList`。
- **工具**（新 `src/main/agent/tools/todowrite.ts`）：`createTodoTool(): AgentTool`，`name: "todowrite"`，`inputSchema = z.object({ todos: z.array(...) })`，`executionMode: "sequential"`（状态写，避免同轮并发覆盖），`execute` 返回 `{ content, details: { todos } }`。
- **注册**（`agentRunner.ts` `createRegistry`）：注册 `todowrite` 并进 `ALL_TOOL_NAMES`（内置工具 9 → 10）；`GATED_BUILTIN_TOOLS`（`permissions/rule.ts`）**不加**。
- **runner 状态**（`agentRunner.ts`）：新增 `private todoList: TodoList = []`、`private pendingTodo: TodoList | null = null`。
  - `handleEvent`：`case "tool_execution_end"` 内，`event.toolName === "todowrite"` 时解析 `(event.result as AgentToolResult).details.todos`（非法/缺失忽略）→ `this.todoList = todos; this.pendingTodo = todos` → `this.eventSink?.({ type: "todo_updated", todos })`。
  - `flushTurn`：`pendingTodo` 非空时在**同一事务**内追加一条 `{ type: "todo", payload: JSON.stringify(pendingTodo) }`（seq 递增），提交后清空 `pendingTodo`。
  - `transformContext`：`todoList.length > 0` 时在返回数组头部插 `createTodoStateMessage(todoList)`（新消息角色）。
  - `DEFAULT_SYSTEM_PROMPT`（`agentRunner.ts:56`）：追加 todo 自动建清单指引段。
  - `readSessionEntries`：新增分支跟踪最后一条 `type === "todo"` entry → 解析 `TodoList`；`restoreSession` 返回 `todos`；`restoreMessages(空)` / `deleteSession` / `deleteMessageTurn` 删除后重读（`readLastTodoEntry`）。
- **消息映射**（`src/main/agent/core/agent.ts` `defaultConvertToLlm`）：`case "todoState"` → `{ role: "user", content: "[任务清单]\n#N [状态] content ..." }`（compact 单块，不放 UI）。
- **renderer**：
  - `hooks/useAgentChat.ts`：新增 `todos` state；订阅 `agentApi.onEvent` 处理 `todo_updated`；`restoreSession` 返回值取 `todos`。
  - 新 `components/TodoDock.tsx`：折叠/展开本地态（默认折叠）；单行当前项 + 状态色 + 展开箭头；展开完整清单（checkbox 只读样式，模型唯一写者，用户不可编辑）。
  - `AgentPage.tsx`：`<TodoDock todos={todos} />` 渲染于 `<AgentInput>` 上方。

## 3. K：agent_call.kind 区分

现状：`flushTurn` 落库 `kind: call.toolName === "task" ? "subagent" : "builtin"`、`mcpServer: null`（database.md §8 已知技术债）。

**决策**：flushTurn 按工具名分类，并补 `mcp_server`：

| 分类 | 判定 | mcp_server |
|------|------|-----------|
| `mcp` | `call.toolName` ∈ `this.activeMcp`（前缀全名） | `fullNameToServer` map 反查 |
| `subagent` | `toolName === "task"`（现状） | null |
| `skill` | `toolName === "read_skill"` | null |
| `builtin` | 其余 | null |

- runner 装配时构建 `Map<fullName, serverName>`（`mcpManager.getTools()` 的 `{ fullName, server }`）。
- 仅影响 `agent_call` 落库；renderer 展示仍依赖 entry payload，不受影响（database.md §2.3 不变）。

## 4. P：子代理 provenance 落库（parent_call_id 启用）

现状：子代理**内部**工具调用不落库（task.ts 订阅嵌套 agent 事件只用于面板快照）。

**决策**：子代理内部每次工具调用写一行 `agent_call`（`session_id` = 父会话、`entry_id` = null、`parent_call_id` = 触发它的 task 调用行 external_id），与父 turn 同事务落库；对齐 database.md §2.3"子代理对父会话就是一次普通调用，内部步骤靠 agent_call 留存 provenance"。**UI 不做展示**（`agent_call` 是查询/审计视图），恢复后子代理面板内容来自既有 `subagent` 快照（不受影响）。

**实现要点**：

- `agentRunner`：
  - `pendingCalls` 的调用记录在 `tool_execution_start` 落 buffer 时**预生成 `externalId`**（`createExternalId()`），flushTurn 插入时复用（父 task 调用行 id 提前可知，供子调用引用）。
  - 新增 `recordChildCall(parentToolCallId: string, child: { toolName, kind, status, args, result, startedAt, finishedAt })`：查 `pendingCalls.get(parentToolCallId)`（未命中忽略）→ 缓冲 `pendingChildCalls[]`（携带 parent externalId）；flushTurn 同事务插入（`entryId: null`、`parentCallId: parentExternalId`、`kind` 按 §3 分类）。
- `task.ts`（`TaskToolDeps` 注入 `recordChildCall`）：嵌套 agent 订阅中，`tool_execution_start` → `recordChildCall(this.toolCallId, { ..., status: "running" })`、`tool_execution_end` → 更新 status/result/finishedAt（复用 `summarizeToolResult` 截断）。
- `agentSessionService.insertCall` 已支持 `parentCallId`（`parent_call_id` 列 + 自引用 FK），无 schema 变更。

## 5. 明确不做项及说明

| 项 | 说明 |
|----|------|
| **S. 会话全文搜索（pi FTS5）** | 现有历史面板仅标题搜索；FTS5 trigram 会话正文搜索为独立功能，本轮不做，留口 |
| **Q. question 工具** | 模型执行中向用户提问（opencode `tool/question.ts`），需新增事件/IPC 交互通道，独立任务 |
| **E. run 恢复** | 维持 v2/v3 决定；触发条件未到 |
| **G1/G2/G3/G4** | 维持 v2/v3 决定 |
| **todo 用户编辑** | dock 只读展示（checkbox 纯样式）；清空/调整仅由模型 `todowrite`（传空数组即清空）；`/todos` 命令不做 |
| **cancelled 独立样式** | 折叠行不出现 cancelled 项（按完成语义落最后）；展开列表按划线展示，不做独立配色 |

## 6. 决策清单（全部已确认）

- 范围 = todo 清单（主）+ kind 区分 + 子代理 provenance（附）；排除 S/Q/E/G1–G4（§1/§5）。
- todo：四态模型、追加型 `todo` entry 整表替换、`todowrite` 工具不进门控、自动建（CC 语义）、`todoState` 注入（不落库不渲染）、`todo_updated` 事件 + restore 带 `todos`、UI 为 AgentInput 上方 dock（折叠一行当前项 / 展开完整列表）（§2.1 #1–11）。
- kind：mcp/subagent/skill/builtin 四分类 + mcp_server 反查（§3）。
- provenance：子代理内部调用同事务落 `agent_call`、`parent_call_id` 指父 task 调用行、UI 不展示（§4）。

无待确认项。

## 7. 实施规范与验证

- **工作区**：确认后在 `.worktrees` 新建 worktree（命名 `时间戳-todo`，如 `20260812-todo/`），在 worktree 内执行全部代码改动；完成 + 自测后询问用户是否合并回 `dev`。
- **IPC 三层契约**：本轮无新 channel（`todo_updated` 复用 `agent:event`）；`AgentRestoredSession` 加字段属契约演进，renderer/preload 同步（design.md §7 规范）。
- **文档同步**：extensions.md §2/§3 内置工具清单 9 → 10 并补 `todowrite` 表项；database.md §2.2 entry type 表补 `todo`、§2.3 补 kind 区分说明、§8 删"kind 未区分"风险行；harness.md §2 已落地能力补 todo。
- **精确校验**（仅受影响范围）：`pnpm typecheck` + Biome format 受影响文件；补 vitest 单测：
  - `test/main/agent/`：`todowrite` 整表替换、`todo` entry 落库（flushTurn 事务内追加）、`todoState` 注入 + convertToLlm 映射、kind 四分类、`recordChildCall` provenance（parent_call_id 指向父调用）。
  - `test/main/services/`：`readLastTodoEntry`（含 fork/删轮后重读回退）。
- 完成检查：无遗留旧导入、无重复 DTO、无无用目录；改动不破坏既有四篇文档描述的接口（按 §7 文档同步更新除外）。
