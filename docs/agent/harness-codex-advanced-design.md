# Codex 级完整 Harness 与系统架构进阶设计方案 (Full Specification)

## 1. 背景与目标

参考 `codex-main`（`/Users/yonah/projects/agent/codex-main`）核心架构规范，在 LX Agent 基础 Harness 之上构建工业级 Harness 全景能力：

1. **三档沙箱策略（Sandbox Policy）**：
   - `ReadOnly`（全只读工作区与系统）
   - `WorkspaceWrite`（当前工作区/CWD 隔离写入，越界阻断与权限提升）
   - `DangerFullAccess`（完全禁用沙箱，全权限执行）
   - 全局设置（Settings）持久化并实时联动系统提示词注入。
2. **模型自适应提示词装配（Model-Adaptive Prompt Assembly）**：
   - 对齐 `gpt-5.2-codex_prompt.md` 规范：精准单行文件引用（`file:line` 单独成行）、ASCII 优先编辑约束、极简注释哲学、Anti-AI-Slop 前端规范。
   - 按模型家族（GPT-5/Codex、Claude、DeepSeek/Generic）自适应组装差异化指令。
3. **结构化多 Agent 协作协议（Inter-Agent Communication Protocol）与子代理池（SubagentPool）**：
   - 对齐 `codex-rs/protocol/src/protocol.rs` 中的 `InterAgentCommunication`。
   - 支持主 Agent 与子代理之间带 `author`、`recipient`、`trigger_turn`、`metadata` 的多轮移交与结果回传。
   - 会话级 SubagentPool 维护，支持基于 `subagent_id` 续接历史上下文。
4. **双协作模式状态机（Collaboration Modes: Default vs Plan Mode）**：
   - 参考 `codex-rs/collaboration-mode-templates/templates/plan.md` 与 `default.md`。
   - **Plan Mode 核心约束**：严格只读（Non-mutating），硬性拦截任何 `edit`、`write`、`applyPatch` 与破坏性终端命令。模型只通过只读工具或 `request_user_input` 消除歧义，最终产出 `<proposed_plan>` 规范块。
   - **Default Mode 核心约束**：面向行动、快速执行与手术刀式精准修改。
5. **专精 Review Agent（代码审查子代理）**：
   - 参考 `codex-rs/core/src/session/review.rs` 与 `codex-rs/prompts/templates/review/rubric.md`。
   - 强制只读沙箱隔离，按 Rubric 维度（Defects、Security、Performance、Taste）深度审查 Diff 并输出结构化报告。
6. **Current Time Reminder（Turn 级周期动态时间感知）**：
   - 参考 `codex-rs/core/src/session/time_reminder.rs`。
   - 在 Turn 状态机中跨越时间阈值（默认 300s）或窗口切换时，动态向模型注入 `<current_time>` 片段。

---

## 2. 核心架构与数据流

```text
+---------------------------------------------------------------------------------+
|                                 Renderer UI                                     |
|   (Sandbox Selector | Collaboration Mode Switcher | Status Bar | Subagent Drawer) |
+----------------------------------------+----------------------------------------+
                                         | IPC (Settings / Mode / Event Stream)
                                         v
+---------------------------------------------------------------------------------+
|                                  Main Process                                   |
|                                                                                 |
|  +---------------------------------------------------------------------------+  |
|  | SettingsStore (sandboxPolicy, collaborationMode)                          |  |
|  +-------------------------------------+-------------------------------------+  |
|                                        |                                        |
|  +-------------------------------------v-------------------------------------+  |
|  | AgentRunner & TurnContext State Machine                                   |  |
|  | - Time Reminder State (calculates elapsed seconds & injects fragment)     |  |
|  | - Active CollaborationMode (default | plan)                                |  |
|  | - Environment Snapshot (<env> Git / Worktree / Platform)                  |  |
|  +-------------------------------------+-------------------------------------+  |
|                                        |                                        |
|  +-------------------------------------v-------------------------------------+  |
|  | Dynamic SystemPromptManager (Adaptive, Sandbox & Mode Aware)              |  |
|  | - Layer 0: Core Identity                                                  |  |
|  | - Layer 1: Collaboration Mode Template (plan.md / default.md)             |  |
|  | - Layer 2: Model-Adaptive Instructions (Codex / Claude / Generic)         |  |
|  | - Layer 3: Sandbox Constraints (<sandbox_policy>)                          |  |
|  | - Layer 4: Time Reminder Context (<current_time>)                         |  |
|  | - Layer 5: Cascade Instructions (AGENTS.md)                               |  |
|  | - Layer 6: Active Skills & Tools Registry                                 |  |
|  +-------------------------------------+-------------------------------------+  |
|                                        |                                        |
|  +-------------------------------------v-------------------------------------+  |
|  | PermissionManager & Multi-Gate Sandbox                                    |  |
|  | - Plan Mode Gate: Hard block on all mutating tools (write/edit/side-effects)|
|  | - Sandbox Policy Gate (ReadOnly / WorkspaceWrite / DangerFullAccess)       |  |
|  | - Command Safety Guard (Destructive shell commands filter)                |  |
|  +-------------------------------------+-------------------------------------+  |
|                                        |                                        |
|  +-------------------------------------v-------------------------------------+  |
|  | SubagentPool & Specialized Agents                                         |  |
|  | - Subagent Pool: Context resume via subagent_id                          |  |
|  | - Review Agent: Read-only sandbox + Rubric Evaluation + Structured Diff   |  |
|  +---------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------+
```

---

## 3. 核心数据结构与契约定义

### 3.1 协议契约 (`src/shared/contracts/agent.ts`)
```typescript
export type SandboxPolicy = "read-only" | "workspace-write" | "danger-full-access"
export type CollaborationMode = "default" | "plan"

export interface AgentSettings {
  sandboxPolicy: SandboxPolicy
  collaborationMode?: CollaborationMode
  // ... 其他配置
}

export interface InterAgentCommunication {
  author: string
  recipient: string
  triggerTurn: boolean
  content: string
  metadata?: Record<string, unknown>
}
```

### 3.2 模式与沙箱行为语义矩阵
| 模式与沙箱组合 | 读文件 | 当前工作区写文件 | 跨工作区写文件 | 只读命令 | 破坏性/高危命令 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Plan Mode` (任意沙箱) | 允许 | **拒绝 (Plan Mode 只读)** | **拒绝** | 允许 | **拒绝** |
| `Default Mode` + `read-only` | 允许 | 拒绝 | 拒绝 | 允许 | 拒绝 |
| `Default Mode` + `workspace-write` | 允许 | 允许 | 提示用户审批 | 允许 | 拦截/审批 |
| `Default Mode` + `danger-full-access` | 允许 | 允许 | 允许 | 允许 | 拦截高危命令 |

---

## 4. 规范与安全准则
- 所有系统提示词、错误阻断、权限交互统一使用**纯英文**；
- UI 文案统一走 i18n 多语言系统；
- 样式严格采用 CSS Token，适配多主题；
- 代码改动前使用 `codegraph` 和 `codebase-memory-mcp` 验证影响范围；
- 在独立 `.worktrees/` 工作区执行，测试通过后经确认合入 `dev`。
