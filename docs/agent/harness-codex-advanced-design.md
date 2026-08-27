# Codex 级完整 Harness 与系统架构进阶设计方案

## 1. 背景与目标

在 Phase 1~4 基础重构（环境感知 `<env>`、Turn 状态切片、命令安全拦截、FIFO 排队与双击中断）已合入 `dev` 的基础上，参考 `codex-main`（`/Users/yonah/projects/agent/codex-main`）核心规范，实现工业级全量 Harness 能力：

1. **三档沙箱策略（Sandbox Policy）**：
   - `ReadOnly`（全只读工作区与系统）
   - `WorkspaceWrite`（当前工作区/CWD 隔离写入，越界阻断与权限提升）
   - `DangerFullAccess`（完全禁用沙箱，全权限执行）
   - 全局设置（Settings）持久化并实时联动系统提示词注入。
2. **模型自适应提示词装配（Model-Adaptive Prompt Assembly）**：
   - 对齐 `gpt-5.2-codex_prompt.md` 规范：精准单行文件引用（`file:line` 单独成行）、ASCII 优先编辑约束、极简注释哲学、Anti-AI-Slop 前端规范。
   - 按模型家族（GPT-5/Codex、Claude、DeepSeek/Generic）自适应组装差异化指令。
3. **结构化多 Agent 协作协议（Inter-Agent Communication Protocol）**：
   - 对齐 `codex-rs/protocol/src/protocol.rs` 中的 `InterAgentCommunication`。
   - 支持主 Agent 与子代理之间带 `author`、`recipient`、`trigger_turn`、`metadata` 的多轮移交与结果回传。
4. **前端控制与体验对齐**：
   - 设置页集成沙箱策略配置。
   - 状态栏与消息气泡精准展示沙箱模式与多 Agent 通信状态。

---

## 2. 核心架构与数据结构

```text
+-------------------------------------------------------------------------------+
|                                UI / Settings                                  |
|         (Sandbox Policy Selector / AgentPage / Status Bar Indicator)          |
+---------------------------------------+---------------------------------------+
                                        | IPC / Settings Stream
                                        v
+-------------------------------------------------------------------------------+
|                                  Main Process                                 |
|                                                                               |
|  +-------------------------------------------------------------------------+  |
|  | SettingsStore (agent.sandboxPolicy: read-only | workspace-write | full) |  |
|  +------------------------------------+------------------------------------+  |
|                                       |                                       |
|  +------------------------------------v------------------------------------+  |
|  | Dynamic SystemPromptManager (Model-Adaptive & Sandbox-Aware)             |  |
|  | - Layer 0: Core Identity                                                |  |
|  | - Layer 1: Model-Adaptive Instructions (GPT-5 Codex / Claude / Generic) |  |
|  | - Layer 2: Sandbox Constraints & Safety Boundary (<sandbox_policy>)    |  |
|  | - Layer 3: Environment Snapshot (<env> Git / Worktree / Platform)       |  |
|  | - Layer 4: Cascade Instructions (AGENTS.md)                             |  |
|  | - Layer 5: Active Skills & Tools Registry                               |  |
|  +------------------------------------+------------------------------------+  |
|                                       |                                       |
|  +------------------------------------v------------------------------------+  |
|  | PermissionManager & FileSystemSandboxGuard                              |  |
|  | - Evaluates sandbox rules (CWD Jail / Path Traversal / Command Safety)  |  |
|  | - Escalation Policy (UnlessTrusted / OnRequest / Granular / Never)      |  |
|  +------------------------------------+------------------------------------+  |
|                                       |                                       |
|  +------------------------------------v------------------------------------+  |
|  | Subagent Communication Bus (InterAgentCommunication)                    |  |
|  | - Structured dispatch between orchestrator and specialized subagents    |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
```

---

## 3. 核心模块详细设计

### 3.1 沙箱策略模型（Sandbox Policy Model）
在 `src/shared/contracts/agent.ts` 与 `PermissionSettings` 中增加：
```typescript
export type SandboxPolicy = "read-only" | "workspace-write" | "danger-full-access"

export interface AgentSettings {
  sandboxPolicy: SandboxPolicy
  // ... 其他现有配置
}
```

#### 行为语义矩阵：
| 沙箱策略 | 读文件 | 当前工作区写文件 | 跨工作区写文件 | 只读终端命令 | 破坏性/高危终端命令 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `read-only` | 允许 | 拒绝（报错或提升） | 拒绝 | 允许 | 拒绝 |
| `workspace-write` | 允许 | 允许 | 提示用户审批 | 允许 | 拦截/审批 |
| `danger-full-access` | 允许 | 允许 | 允许 | 允许 | 拦截高危命令 |

### 3.2 提示词装配引擎自适应重构（Model-Adaptive Prompt Assembly）
在 `src/main/agent/prompts/systemPromptManager.ts` 中根据当前选中的 `modelId` 与 `sandboxPolicy` 动态生成指令：
- **GPT-5 / Codex 族**：注入严苛的 ASCII 优先、单行引用格式、极简注释、Anti-AI-Slop 前端规范；
- **沙箱约束注入**：在 `<env>` 后增加 `<sandbox>` 标签，明确告知模型当前写操作受限范围。

### 3.3 结构化多 Agent 协议与会话持久化（Inter-Agent Communication & Subagent Pool）
扩展 `task` 工具、`SubagentData` 与 `AgentSubagentPanel`：
- **数据结构协议**：对齐 Codex `InterAgentCommunication`，包含 `author`（发出者 Agent 身份）、`recipient`（目标 Agent）、`triggerTurn`（是否立即触发下一轮推理）、`content`（正文与 Markdown 结论）、`metadata`；
- **子代理池管理器（SubagentPool）与上下文续接（Resume）**：
  - 在当前父会话（Session）作用域内建立 `SubagentPool`（`Map<subagentId, Agent>`）；
  - `task` 工具支持 `subagent_id`（可选）参数；
  - 若传入已存在的 `subagent_id`，直接唤醒并续接该 Agent 实例的 `state.messages` 历史，实现多轮长程交互；
  - 若未传或不存在则创建新 Agent 实例并登记入池，分配唯一 `subagent_id`；
  - 继承父级 `sandboxPolicy` 与权限门控（Gate）。
- **前端协同呈现**：
  - 子代理抽屉面板顶部渲染 `Inter-Agent Protocol` 信元时间线，且同一个 `subagent_id` 的多轮执行记录自动归并到同一时间轴。

---

## 4. 规范与安全准则
- 所有系统提示词、错误阻断、权限交互统一使用**纯英文**；
- UI 文案统一走 i18n 多语言系统；
- 样式严格采用 CSS Token，适配多主题；
- 代码改动前使用 `codegraph` 和 `codebase-memory-mcp` 验证影响范围；
- 在独立 `.worktrees/` 工作区执行，测试通过后经确认合入 `dev`。
