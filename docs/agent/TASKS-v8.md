# Agent 与 Harness 继续实施任务文档（v8：Steer 即时插话打断与 Esc 快捷键）

本文是"继续实行 agent 功能和 harness"的**任务文档 v8**。v1–v7 已全部落地（v7 消息队列 / 流式排队已合并入 `dev`）；本轮依据参考项目 [opencode-dev]（`packages/core/src/session/input.ts` 的 `delivery: steer` 与 `run-coordinator.ts` 的 steer 调度机制）与 [pi-main]（`agent-loop.ts` 的 `getSteeringMessages` 拦截点与 `agent.steer()` 机制），确定本轮范围 = **Steer 运行中即时插话打断与 Esc 快捷键（唯一）**，含明确不做项与实施规范。

参考既有文档：核心架构见 [design.md](./design.md)，扩展体系见 [extensions.md](./extensions.md)，Harness 演进与信任模型见 [harness.md](./harness.md)，SQLite 落盘见 [database.md](./database.md)，上一轮见 [TASKS-v7.md](./TASKS-v7.md)。

---

## 1. 背景与范围决策

### 现状分析（代码核验）

1. **底层 steer 基础设施已就绪**：
   - `src/main/agent/core/agent.ts:144` 包含 `PendingMessageQueue`，提供 `steer(message)` 与 `getSteeringMessages()`；
   - `src/main/agent/core/agent-loop.ts:187` 在每轮 turn 边界（工具执行完毕后、下一轮思考前）已调用 `config.getSteeringMessages?.()` 进行消费；
   - `src/main/agent/agentRunner.ts:548` 仅在 `continue()` 续写命令中单向调用了 `agent.steer()`，但 IPC 与 UI 均未暴露给用户主动触发。
2. **快捷键与打断现状**：
   - 停止生成目前主要依赖右下角「停止」图标按钮（`handleStop` → `agentApi.abort`）；
   - `AgentInput` 中 Esc 键仅用于关闭命令/文件面板或拒绝权限请求，在空闲/生成中没有用于打断生成的全局与局部响应机制。
3. **消息发送现状**：
   - 在 `isStreaming` 期间，用户按 `Enter` 触发的是 v7 的 `queue` 排队逻辑（当前 run 结束后执行）。

### 范围决策

| # | 能力 | 结论 |
|---|------|------|
| **S** | **Steer 即时插话**（流式中 Shift+Enter 或 `/steer` 发送，注入当前 run 的 turn 边界即时引导转向） | **本轮做** |
| **K** | **Esc 分级打断快捷键**（弹窗/草稿优先清空，空输入/非聚焦时 Esc 触发 Abort） | **本轮做** |
| **U** | **Steer 消息专属微标签展示**（带有 `isSteer: true` 标记独立落盘与渲染） | **本轮做** |
| R | run 恢复（resume，pi harness v3） | 不做（维持） |
| F | 会话全文搜索（pi FTS5） | 不做（维持） |
| P | plan 模式 / refs 多分支树 UI | 不做（维持） |

---

## 2. Steer 即时插话机制（Main 进程）

### 2.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | **触发接口** | 扩展 `agentApi.send` 契约，支持可选参数 `options?: { delivery?: "queue" | "steer" }`，或新增专有 `steer` channel/参数 |
| 2 | **执行逻辑** | 当 `isStreaming` 为 true 且 `delivery === "steer"` 时：直接调用底层 `this.agent.steer(text)`，同时构造带有 `isSteer: true` 元数据的 user message 写入当前会话 session entry 并通过 `agent:event` 推送 `message_start` |
| 3 | **流式中处理** | 若当前模型正处于单次流式 token 生成中，steer 消息会在当前 LLM 回复完成、进入工具调用或下一次循环前（`agent-loop.ts:187`）被立即消费，实现平滑转向 |
| 4 | **持久化与恢复** | Steer 消息作为普通 User Turn 入库，entry 中标记 `isSteer: true`；会话恢复时与常规消息统一加载，但携带 steer 标记 |
| 5 | **并发安全** | 权限请求挂起时拒绝 steer（权限面板独占）；若无运行中的 agent 时收到 steer，退化为普通 `send` 启动新 turn |

### 2.2 契约与实现要点

- **`shared/contracts/agent.ts`**：
  - `AgentSendOptions = { delivery?: "queue" | "steer" }`
  - `AgentSendResult` 扩展：`steered?: boolean`
  - `ChatMessage` 与 `AgentMessage` 支持 `isSteer?: boolean`
- **`src/main/agent/agentRunner.ts`**：
  - `send(text, context, options)` 改造：判断 `options?.delivery === "steer"` 且 `isStreaming` 时，触发 `agent.steer(expanded)`，分发事件并落盘。

---

## 3. Esc 快捷键与打断交互（Renderer 进程）

### 3.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | **分级响应机制** | ① 补全/提及/命令面板激活态：Esc 关闭面板；<br/>② 输入框有未发送草稿：Esc 清空草稿；<br/>③ 输入框为空且 `isStreaming`：Esc 触发 `handleStop()`（Abort 终止并清空排队）；<br/>④ 聊天区域全局 Esc（非聚焦输入框时）：若 `isStreaming` 直接触发 `handleStop()` |
| 2 | **输入区分流** | - `Enter`（无修饰键）：默认执行排队发送（`delivery: "queue"`）；<br/>- `Shift+Enter` 或输入 `/steer <内容>`：执行即时插话（`delivery: "steer"`）；<br/>- 多行换行支持：`Ctrl+Enter` / `Alt+Enter`（或根据平台适配换行） |
| 3 | **UI 气泡标识** | 用户消息气泡右上角/头部展示轻量微标签 `[即时插话 / Steer]`，与普通排队发送视觉区分 |

### 3.2 实现要点

- **`AgentInput.tsx`**：
  - 改造 `handleKeyDown`：完善 Esc 分级处理逻辑；拦截 `Shift+Enter` 触发 Steer 模式发送；
  - 支持 `/steer ` 指令快速识别。
- **`useAgentChat.ts`**：
  - `sendMessage` 支持传参 `delivery: "queue" | "steer"`；
  - 处理 `steered` 返回结果与即时气泡挂载。
- **`AgentMessageBubble.tsx` / `UserMessageBlock.tsx`**：
  - 渲染 `isSteer` 微标签（优雅简洁的 tag）。
- **全局 Esc 监听**：
  - 在 `AgentPage.tsx` 挂载 `window.addEventListener("keydown")`，当按下 Esc 且当前无模态弹窗、未聚焦于特定 input 时，若 `isStreaming` 为 true 则调用 `handleStop()`。

---

## 4. 实施规范与步骤

1. **工作区准备**：
   - 得到确认后，在 `.worktrees` 下建立新分支工作区：`时间戳-v8-steer-and-esc-abort`。
2. **代码修改与校验**：
   - 保持三进程边界清晰；
   - 仅对修改范围执行类型检查与格式化（`pnpm typecheck` / Biome）；
   - 确保无遗留旧逻辑与无效抽象。
3. **交付与合并**：
   - 修改完成后向用户汇报已完成内容、验证结果、风险与下一步，并询问用户是否合并到 `dev` 分支。
