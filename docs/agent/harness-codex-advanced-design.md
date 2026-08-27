# Codex 级完整 Harness 与系统架构进阶设计方案 (Full Specification)

## 1. 背景与演进目标

参考 `codex-main`（`/Users/yonah/projects/agent/codex-main`）核心 Harness 与 Agentic Runtime 架构，在 LX Agent 已实现的沙箱策略、Plan/Default 模式、SubagentPool、Review Agent 和时间感知基础之上，补全进阶工业级架构能力：

### 已完成核心（Phase 1 ~ Phase 10）
1. **三档沙箱策略（Sandbox Policy）**：`ReadOnly`、`WorkspaceWrite`、`DangerFullAccess`。
2. **模型自适应提示词装配（Model-Adaptive Prompt Assembly）**：对齐 GPT-5.2 Codex / Claude / Generic 规则与 ASCII 优先编辑、`file:line` 引用。
3. **结构化多 Agent 协作协议（Inter-Agent Communication Protocol）与子代理池（SubagentPool）**。
4. **双协作模式状态机（Collaboration Modes: Default vs Plan Mode）**：Plan 模式严格 Non-mutating 只读硬阻断。
5. **专精 Review Agent（代码审查子代理）**：Rubric 维度审查 Diff 报告。
6. **Current Time Reminder（Turn 级周期动态时间感知）**：对齐 Codex `<current_time>` 时间片段注入。

### 新增进阶演进（Phase 11 ~ Phase 16）
7. **Unified Exec（统一进程执行引擎与 HeadTailBuffer）**：
   - 参考 `codex-rs/core/src/unified_exec/`。
   - 对称式 `HeadTailBuffer`（前后各 50% 容量，超出部分中间丢弃并插入 `[...N bytes omitted...]` 标记）。
   - 统一管理短命令执行、交互式命令与长时任务生命周期。
8. **多级审批策略体系（Multi-Level Approval & Escalation）**：
   - 参考 `codex-rs/core/src/tools/approvals.rs` 与 `codex-rs/protocol/src/approvals.rs`。
   - 三级策略（`never` / `on_request` / `unless_trusted`）。
   - 支持 `Approve Once`（单次放行）、`Approve Session`（会话级前缀/路径放行）、`Deny`（注入错误回流）。
9. **Guardian 安全防护网（Security Guardian Policy）**：
   - 参考 `codex-rs/core/src/guardian/policy.md` 与 `codex-rs/core/src/guardian/prompt.rs`。
   - 维度：数据外发（Data Exfiltration）、凭据刺探（Credential Probing）、持久化降权（Persistent Security Weakening）、破坏性操作（Destructive Actions）。
10. **分层记忆系统（Hierarchical Workspace Memories & Citations）**：
    - 参考 `codex-rs/ext/memories/` 与 `templates/memories/read_path.md`。
    - 结构：`MEMORY.md` 索引、`rollout_summaries/` 历史沉淀、`extensions/ad_hoc/notes/` 动态提取。
    - 回复规范强制输出 `<oai-mem-citation>` 引用块。
11. **结构化压缩回滚与远程压缩（Compact Parity & Rollout Recovery）**：
    - 增强现有 `ContextCompactor`，支持与 session rollout 溯源深度绑定。

---

## 2. 核心架构与数据流

```text
+---------------------------------------------------------------------------------+
|                                 Renderer UI                                     |
|   (Sandbox Selector | Collaboration Mode | Approval Overlay | Memory Viewer)    |
+----------------------------------------+----------------------------------------+
                                         | IPC (Settings / Mode / Event Stream)
                                         v
+---------------------------------------------------------------------------------+
|                                  Main Process                                   |
|                                                                                 |
|  +---------------------------------------------------------------------------+  |
|  | SettingsStore (sandboxPolicy, collaborationMode, approvalPolicy)          |  |
|  +-------------------------------------+-------------------------------------+  |
|                                        |                                        |
|  +-------------------------------------v-------------------------------------+  |
|  | AgentRunner & TurnContext State Machine                                   |  |
|  | - Time Reminder State (calculates elapsed seconds & injects fragment)     |  |
|  | - Active CollaborationMode (default | plan)                                |  |
|  | - Memory Engine (reads MEMORY.md, tracks citations, parses <oai-mem-cit>) |  |
|  +-------------------------------------+-------------------------------------+  |
|                                        |                                        |
|  +-------------------------------------v-------------------------------------+  |
|  | Dynamic SystemPromptManager (Adaptive, Sandbox & Mode & Memory Aware)     |  |
|  | - Layer 0: Core Identity                                                  |  |
|  | - Layer 1: Collaboration Mode Template (plan.md / default.md)             |  |
|  | - Layer 2: Model-Adaptive Instructions (Codex / Claude / Generic)         |  |
|  | - Layer 3: Sandbox Constraints (<sandbox_policy>)                          |  |
|  | - Layer 4: Time Reminder Context (<current_time>)                         |  |
|  | - Layer 5: Workspace Memory Context (MEMORY_SUMMARY)                      |  |
|  | - Layer 6: Cascade Instructions (AGENTS.md)                               |  |
|  | - Layer 7: Active Skills & Tools Registry                                 |  |
|  +-------------------------------------+-------------------------------------+  |
|                                        |                                        |
|  +-------------------------------------v-------------------------------------+  |
|  | PermissionManager & Multi-Gate Sandbox & Guardian                         |  |
|  | - Plan Mode Gate: Hard block on mutating tools                            |  |
|  | - Sandbox Policy Gate (ReadOnly / WorkspaceWrite / DangerFullAccess)       |  |
|  | - Approval Policy Engine (never / on_request / unless_trusted)            |  |
|  | - Guardian Risk Evaluator (Exfiltration / Probing / Destruction)          |  |
|  +-------------------------------------+-------------------------------------+  |
|                                        |                                        |
|  +-------------------------------------v-------------------------------------+  |
|  | UnifiedExecManager (Unified Execution Engine)                             |  |
|  | - HeadTailBuffer (symmetric capping 50/50 + omission marker)              |  |
|  | - Process Registry & PTY Stream Adapter                                   |  |
|  +-------------------------------------+-------------------------------------+  |
|                                        |                                        |
|  +-------------------------------------v-------------------------------------+  |
|  | SubagentPool & Specialized Agents                                         |  |
|  | - Subagent Pool: Context resume via subagent_id                          |  |
|  | - Review Agent: Read-only sandbox + Rubric Evaluation                     |  |
|  +---------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------+
```

---

## 3. 核心数据结构与契约定义

### 3.1 协议契约 (`src/shared/contracts/agent.ts`)
```typescript
export type SandboxPolicy = "read-only" | "workspace-write" | "danger-full-access"
export type CollaborationMode = "default" | "plan"
export type ApprovalPolicy = "never" | "on_request" | "unless_trusted"

export interface ApprovalDecisionPayload {
  requestId: string
  decision: "approve_once" | "approve_session" | "deny"
  reason?: string
}

export interface ExecBufferConfig {
  maxBytes: number
  headRatio?: number // default 0.5
}

export interface MemoryCitation {
  path: string
  lines?: [number, number]
  note?: string
  rolloutId?: string
}
```

### 3.2 模式、沙箱与审批矩阵
| 模式 + 沙箱 | 审批策略 | 执行白名单命令 | 执行未受信任写/高危命令 | 行为 |
| :--- | :--- | :--- | :--- | :--- |
| `Plan Mode` | 任意 | 放行（只读） | **硬拦截（拒绝）** | 注入 Plan Mode 只读说明 |
| `Default` + `read-only` | 任意 | 放行（只读） | **硬拦截（拒绝）** | 注入 Sandbox 只读说明 |
| `Default` + `workspace-write` | `on_request` | 放行 | 弹出 Approval 弹窗 | 支持 Once / Session / Deny |
| `Default` + `workspace-write` | `never` | 放行 | 直接放行/Guardian 兜底 | 自动放行非致命操作 |

---

## 4. 规范与安全准则
- 所有系统提示词、错误阻断、权限交互统一使用**纯英文**；
- UI 文案统一走 i18n 多语言系统；
- 样式严格采用 CSS Token，适配多主题；
- 代码改动前使用 `codegraph` 和 `codebase-memory-mcp` 验证影响范围；
- 在独立 `.worktrees/` 工作区执行，测试通过后经确认合入 `dev`。
