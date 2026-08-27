# Codex 级 Harness 与架构进阶任务分解清单 (Tasks)

## 状态总览
- [x] Phase 1: 三档沙箱策略模型与设置持久化（Contracts & SettingsStore & PermissionManager）
- [x] Phase 2: 模型自适应与沙箱感知提示词装配（SystemPromptManager & Model Adapters）
- [x] Phase 3: 结构化多 Agent 协作通信协议（Task Tool & InterAgentCommunication）
- [x] Phase 4: 前端设置与交互状态同步（Settings View & Status Bar & 全链路单测）
- [x] Phase 5: 子代理会话池管理与长程上下文续接（Subagent Pool & Resume & 多轮追问）

---

## 阶段细分与执行步骤

### Phase 1: 三档沙箱策略模型与设置持久化
- [x] **Task 1.1: 协议与类型契约更新**
  - 在 `src/shared/contracts/agent.ts` 中定义 `SandboxPolicy` 类型（`read-only` | `workspace-write` | `danger-full-access`）。
  - 更新 `AgentSettings` 与 `PermissionSettings` 接口。
- [x] **Task 1.2: Main 进程 PermissionManager 与写操作拦截强化**
  - 在 `PermissionManager` 中集成 `sandboxPolicy` 判定逻辑。
  - 在 `read-only` 模式下，直接拦截任何 `write`、`edit` 和破坏性终端操作，返回纯英文原因。
  - 在 `workspace-write` 模式下，对 CWD 以外的写入进行越界拦截并触发权限提升请求。
- [x] **Task 1.3: 单元测试**
  - 为 `PermissionManager` 的三档沙箱逻辑编写完备单元测试（覆盖只读阻断、越界审批与全权限放行）。

### Phase 2: 模型自适应与沙箱感知提示词装配
- [x] **Task 2.1: Model-Adaptive System Prompt Manager**
  - 重构 `src/main/agent/prompts/systemPromptManager.ts` 与 `modelAdapters.ts`。
  - 增加 `<sandbox_policy>` 环境变量注入段（标识只读/工作区写/完全访问模式）。
  - 抽象 `VENDOR_SIGNATURES` 解耦版本号，支持 OpenAI/Claude/Gemini/DeepSeek/Qwen/GLM/MiniMax/MiMo/Generic。
- [x] **Task 2.2: Assembly 组装器联动**
  - 在 `src/main/agent/assembly.ts` 中传入模型标识与沙箱策略，验证动态组装结果。
- [x] **Task 2.3: 单元测试**
  - 编写 `test/main/agent/prompts/modelAdaptivePrompt.test.ts` 验证各模型家族与沙箱模式下的装配正确性。

### Phase 3: 结构化多 Agent 协作通信协议
- [x] **Task 3.1: InterAgentCommunication 协议对齐**
  - 在 `src/main/agent/tools/task.ts` 中引入结构化交互消息。
  - 支持记录 `author`、`recipient`、`triggerTurn` 及任务执行状态树。
- [x] **Task 3.2: 子代理生命周期与状态回传**
  - 完善子代理执行流向主 Agent 回传的结构化 DTO，并在 `AgentMessageItem` / `AgentSubagentBlock` 中精准解析。
- [x] **Task 3.3: 单元测试**
  - 编写多 Agent 协作与消息分发单元测试。

### Phase 4: 前端设置与交互状态同步
- [x] **Task 4.1: 设置面板沙箱策略配置项**
  - 在前端设置页增加沙箱模式切换控件（下拉菜单与说明），接入 i18n 多语言与 CSS Token。
- [x] **Task 4.2: 状态栏指示器与 Tooltip 适配**
  - 状态栏权限/沙箱盾牌图标根据当前激活沙箱模式展示不同色态与描述（常驻沙箱模式盾牌，发生请求切换告警盾牌），统一 LxTooltip 换行。
- [x] **Task 4.3: 全量回归与 E2E 校验**
  - 运行 `pnpm test test/main/agent` 与 `pnpm test test/renderer/features/agent`。
  - 确保全量测试套件全部通过。

### Phase 5: 子代理会话池管理与长程上下文续接（Subagent Pool & Resume）
- [x] **Task 5.1: 会话级 SubagentPool 管理器**
  - 在主进程 `agentRunner` 中为当前会话维护 `SubagentPool`（`Map<subagentId, Agent>`）。
  - 会话销毁或切换时自动清理子代理池。
- [x] **Task 5.2: Task 工具入参与续接支持**
  - 扩展 `task` 工具 schema，支持传入 `subagent_id`。
  - 若命中已有 `subagent_id`，复用其上下文历史并调用 `subAgent.prompt(newPrompt)` 继续推进多轮推理。
  - 若未传入则生成唯一 `subagent_id` 并在结果中回传，提示主 Agent 后续可通过该 id 续接上下文。
- [x] **Task 5.3: 前端多轮子代理对话呈现**
  - 在 `AgentSubagentPanel` 中支持展示 `ID` 标识、多轮 `Inter-Agent Protocol` 信元与多轮助手/工具流式聚合显示。
- [x] **Task 5.4: 单元测试验证**
  - 编写子代理多轮续接执行与上下文累加单测用例。
