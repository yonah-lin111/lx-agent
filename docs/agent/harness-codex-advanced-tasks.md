# Codex 级 Harness 与架构进阶任务分解清单 (Master Task List)

## 状态总览
- [x] Phase 1: 三档沙箱策略模型与设置持久化（Contracts & SettingsStore & PermissionManager）
- [x] Phase 2: 模型自适应与沙箱感知提示词装配（SystemPromptManager & Model Adapters）
- [x] Phase 3: 结构化多 Agent 协作通信协议（Task Tool & InterAgentCommunication）
- [x] Phase 4: 前端设置与交互状态同步（Settings View & Status Bar & 全链路单测）
- [x] Phase 5: 子代理会话池管理与长程上下文续接（Subagent Pool & Resume & 多轮追问）
- [x] Phase 6: Collaboration Mode (Default vs Plan) 契约与主进程状态机
- [x] Phase 7: Plan Mode 权限与写操作硬性阻断拦截（Non-mutating Gate）
- [x] Phase 8: Current Time Reminder 状态机与动态注入（<current_time> Injection）
- [x] Phase 9: 专精 Review Agent 子代理与 Rubric 审查能力（Rubric Evaluation）
- [x] Phase 10: 前端模式切换交互与全量单测回归

---

## 阶段细分与执行步骤

### Phase 1: 三档沙箱策略模型与设置持久化（已完成）
- [x] **Task 1.1: 协议与类型契约更新**
  - 在 `src/shared/contracts/agent.ts` 中定义 `SandboxPolicy` 类型（`read-only` | `workspace-write` | `danger-full-access`）。
  - 更新 `AgentSettings` 与 `PermissionSettings` 接口。
- [x] **Task 1.2: Main 进程 PermissionManager 与写操作拦截强化**
  - 在 `PermissionManager` 中集成 `sandboxPolicy` 判定逻辑。
  - 在 `read-only` 模式下，直接拦截任何 `write`、`edit` 和破坏性终端操作，返回纯英文原因。
  - 在 `workspace-write` 模式下，对 CWD 以外的写入进行越界拦截并触发权限提升请求。
- [x] **Task 1.3: 单元测试**
  - 为 `PermissionManager` 的三档沙箱逻辑编写完备单元测试。

### Phase 2: 模型自适应与沙箱感知提示词装配（已完成）
- [x] **Task 2.1: Model-Adaptive System Prompt Manager**
  - 重构 `src/main/agent/prompts/systemPromptManager.ts` 与 `modelAdapters.ts`。
  - 增加 `<sandbox_policy>` 环境变量注入段。
  - 抽象 `VENDOR_SIGNATURES` 解耦版本号。
- [x] **Task 2.2: Assembly 组装器联动**
  - 在 `src/main/agent/assembly.ts` 中传入模型标识与沙箱策略。
- [x] **Task 2.3: 单元测试**
  - 编写 `test/main/agent/prompts/modelAdaptivePrompt.test.ts` 验证装配正确性。

### Phase 3: 结构化多 Agent 协作通信协议（已完成）
- [x] **Task 3.1: InterAgentCommunication 协议对齐**
  - 在 `src/main/agent/tools/task.ts` 中引入结构化交互消息。
- [x] **Task 3.2: 子代理生命周期与状态回传**
  - 完善子代理执行流向主 Agent 回传的结构化 DTO。
- [x] **Task 3.3: 单元测试**
  - 编写多 Agent 协作与消息分发单元测试。

### Phase 4: 前端设置与交互状态同步（已完成）
- [x] **Task 4.1: 设置面板沙箱策略配置项**
  - 前端设置页增加沙箱模式切换控件，接入 i18n 与 CSS Token。
- [x] **Task 4.2: 状态栏指示器与 Tooltip 适配**
  - 状态栏权限/沙箱盾牌图标根据沙箱模式展示不同色态。
- [x] **Task 4.3: 全量回归与 E2E 校验**
  - 运行全量单元测试套件。

### Phase 5: 子代理会话池管理与长程上下文续接（已完成）
- [x] **Task 5.1: 会话级 SubagentPool 管理器**
  - 在主进程维护 `SubagentPool`（`Map<subagentId, Agent>`）。
- [x] **Task 5.2: Task 工具入参与续接支持**
  - 扩展 `task` 工具 schema，支持传入 `subagent_id` 续接历史。
- [x] **Task 5.3: 前端多轮子代理对话呈现**
  - 在 `AgentSubagentPanel` 中支持多轮 `Inter-Agent Protocol` 信元呈现。
- [x] **Task 5.4: 单元测试验证**
  - 编写子代理多轮续接单测用例。

---

### Phase 6: Collaboration Mode (Default vs Plan) 契约与主进程状态机（当前规划）
- [ ] **Task 6.1: 协议与类型契约更新**
  - 在 `src/shared/contracts/agent.ts` 中定义 `CollaborationMode = "default" | "plan"`。
  - 在 `AgentState`、`AgentSettings` 及相关 IPC 契约中加入 `collaborationMode` 字段。
- [ ] **Task 6.2: SystemPromptManager 提示词模板注入**
  - 增加 `COLLABORATION_MODE` 提示词分段。
  - 集成 Codex 规范的 Plan Mode 规则（`plan.md`：3 阶段规划、`<proposed_plan>` 规范输出）与 Default Mode 规则。
- [ ] **Task 6.3: AgentRunner 状态流转与持久化**
  - 在 `AgentRunner` 中维护当前会话的 `collaborationMode`，支持 IPC 切换与会话级持久化。

### Phase 7: Plan Mode 权限与写操作硬性阻断拦截
- [x] **Task 7.1: PermissionManager Plan Mode 门控**
  - 在 `permissionManager.evaluate` 中加入 `collaborationMode` 检查。
  - 当处于 `plan` 模式时，任何 `edit`、`write`、`applyPatch` 工具调用以及破坏性 bash 命令直接阻断，返回只读规划提示。
- [x] **Task 7.2: 单元测试验证**
  - 编写 `test/main/agent/guard/planModeGuard.test.ts`，验证 Plan Mode 下只读操作放行、写操作硬拦截。

### Phase 8: Current Time Reminder 状态机与动态注入
- [x] **Task 8.1: TimeReminder 状态机实现**
  - 在 `src/main/agent/core/turnContext.ts` 或独立模块中实现时间追踪器。
  - 记录 `lastDeliveryTime`，超过时间阈值（默认 300 秒）或新窗口时触发注入。
- [x] **Task 8.2: 动态 `<current_time>` 注入**
  - 在 `assembly.ts` 与 `systemPromptManager.ts` 中注册并格式化时间块。
- [x] **Task 8.3: 单元测试验证**
  - 编写 `test/main/agent/timeReminder.test.ts` 验证时间提醒触发策略。

### Phase 9: 专精 Review Agent 子代理与 Rubric 审查能力
- [x] **Task 9.1: Review Agent 提示词与 Rubric 规范**
  - 在 `src/main/agent/subagent/reviewAgent.ts` 中实现代码审查专用配置与 Rubric 提示词。
  - 审查维度：Defects、Security、Performance、Code Taste。
- [x] **Task 9.2: Task 工具与 Review Agent 对齐**
  - 在 `src/main/agent/tools/task.ts` 中支持调用或识别 `review-agent`，强制指定只读沙箱与审查输出模板。
- [x] **Task 9.3: 单元测试验证**
  - 编写 Review Agent 的单元测试与结构化报告解析测试。

### Phase 10: 前端模式切换交互与全量单测回归
- [x] **Task 10.1: 前端 AgentPage 模式切换与 UI 渲染**
  - 在输入框或状态栏提供 Default / Plan 模式切换控件。
  - 渲染 `<proposed_plan>` 规范高亮与审查报告卡片。
- [x] **Task 10.2: 全链路回归与单测验证**
  - 运行 `pnpm test test/main/agent` 与前端测试，确保全部测试通过。
