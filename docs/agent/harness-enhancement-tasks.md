# LX Agent Harness 与提示词增强实施任务清单 (Task Tracker)

本清单规划了将 `codex-main` 核心 Harness 与提示词增强落地的工程任务。执行时严格按步骤在专属 Worktree 分支开发。

---

## 阶段一：系统提示词与行为规范增强 (Prompt & Behavior)

- [x] **Task 1.1: 增强 `SystemPromptManager` 通用行为规范**
  - **位置**: `src/main/agent/prompts/systemPromptManager.ts`
  - **内容**: 
    - 引入对齐 Codex 的 `Preamble` 规范与 `Task Planning` 结构化约束（明确高质量与低质量 Plan 样例）。
    - 规范化多文件修改优先使用 `apply_patch`，单点修改使用 `edit`/`write`。
    - 补充严苛的 Reviewer 四维审查标准。
  - **验证**: `npm test test/main/agent/prompts/systemPromptManager.test.ts` (已通过)

- [x] **Task 1.2: 升级 Plan Mode 三阶段状态机指引**
  - **位置**: `src/main/agent/prompts/systemPromptManager.ts`
  - **内容**:
    - 在 `COLLABORATION_MODE` 段中注入严格的 3 阶段工作流（探测环境 -> 盘问澄清 -> 输出方案并自动切回 default 模式）。
    - 增加模式切换的强提示（避免停留在 Plan 模式尝试写文件）。
  - **验证**: 单元测试验证 Plan Mode 提示词装配输出。(已通过)

---

## 阶段二：Harness 运行时增量差分与状态注入 (WorldState & Guidance)

- [x] **Task 2.1: 构建 `WorldStateManager` 增量差分管理器**
  - **位置**: `src/main/agent/core/worldState.ts` (新建)
  - **内容**:
    - 实现 `WorldStateSection` 接口与 `render_diff` 差分渲染逻辑。
    - 支持 `EnvironmentState`、`ContextWindowGuidanceState`、`SubagentState` 的快照对比。
    - 在 `TurnContext` 和 `agentRunner` 中集成，仅注入发生变更的上下文块。
  - **验证**: 编写 `test/main/agent/core/worldState.test.ts` 验证 Turn 间差分行为。(已通过)

- [x] **Task 2.2: 动态上下文窗口引导 (`ContextWindowGuidance`)**
  - **位置**: `src/main/agent/core/worldState.ts` & `src/main/agent/prompts/systemPromptManager.ts`
  - **内容**:
    - 根据会话当前 Token 预算（例如接近模型上限 65% 或 85% 时）动态注入精简策略或主动压缩提示。
  - **验证**: 单元测试验证 Guidance 片段按阈值生成。(已通过)

---

## 阶段三：多 Agent 协作通信与运行时自愈 Harness

- [ ] **Task 3.1: 结构化 Subagent 消息与进度通知注入**
  - **位置**: `src/main/agent/subagent/subagentPool.ts`
  - **内容**:
    - 规范化子代理任务完成、阶段汇报及异常的结构化消息格式（`subagent_notification`）。
    - 增强主代理对子代理并行执行状态的感知。
  - **验证**: `npm test test/main/agent/subagent/subagentPool.test.ts`

- [x] **Task 3.2: 运行时错误与执行自愈守卫 (`HarnessFeedbackGuard`)**
  - **位置**: `src/main/agent/guard/harnessFeedbackGuard.ts` (新建)
  - **内容**:
    - 拦截并发进程超限、长输出截断、Patch 语法错位，自动在下一步回灌修正指引，防止模型陷入重复无效尝试。
  - **验证**: 代码已实现。

---

## 阶段四：UI 与交互流对齐 (Renderer Flow)

- [ ] **Task 4.1: UI 执行流组件增强 (`AgentExecutionFlowList`)**
  - **位置**: `src/renderer/src/features/agent/components/AgentExecutionFlowList.tsx`
  - **内容**:
    - 视觉呈现 Plan 模式的 3 阶段流转指示器与子代理树状折叠。
  - **验证**: UI 组件渲染与交互测试。
