# Thread Goal & Autonomous Continuation Harness 任务清单

> **执行原则**：
> 1. 严格按单个 Task 独立执行，严禁一次性全量盲目改动。
> 2. 每个 Task 需在 `.worktrees/` 下新建独立的 Git 工作区执行。
> 3. Task 完成后执行单域精确测试校验并向用户汇报，征得用户确认后询问是否合并，合并后方可推进下一 Task。

---

## 任务拆解与状态

- [x] **Task 1: 协议契约扩展与分层目标提示词模板管理**
  - **目标**：在 `contracts/agent.ts` 中定义 `ThreadGoal`、`ThreadGoalStatus`、`UpdateGoalParams` 契约；在 `src/main/agent/prompts/goals/` 建立纯英文 `continuation.md`、`budget_limit.md`、`objective_updated.md` 模板与加载器；编写单测验证模板变量插值与证据审计文本完整性。
  - **涉及文件**：
    - `src/shared/contracts/agent.ts`
    - `src/main/agent/prompts/goals/continuation.md`
    - `src/main/agent/prompts/goals/budget_limit.md`
    - `src/main/agent/prompts/goals/objective_updated.md`
    - `src/main/agent/prompts/goals/goalPromptManager.ts`
    - `test/main/agent/prompts/goalPromptManager.test.ts`
  - **验证指标**：
    - 模板正确解析 `objective`、`tokens_used`、`token_budget`、`current_turn`、`max_turns`。
    - 包含完整的 Completion Audit（证据完成度核验）与 Blocked Audit（三轮阻断判定）约束。
    - 单元测试 100% 通过。

- [x] **Task 2: 内置工具 update_goal 与 GoalManager 状态机实现**
  - **目标**：创建 `src/main/agent/goal/goalManager.ts` 纯数据状态机（管理会话的目标创建、轮次计数、状态流转与停滞计数）；实现 `src/main/agent/tools/updateGoal.ts` 内置工具，接入工具注册表；单测覆盖完整状态转换（active -> completed / blocked / paused / cancelled）。
  - **涉及文件**：
    - `src/main/agent/goal/goalManager.ts`
    - `src/main/agent/tools/updateGoal.ts`
    - `src/main/agent/assembly.ts`
    - `test/main/agent/goal/goalManager.test.ts`
    - `test/main/agent/tools/updateGoal.test.ts`
  - **验证指标**：
    - 模型可调用 `update_goal` 显式提交 `complete` 或 `blocked`，非法状态转换被严密阻断。
    - 停滞计数器在无副作用轮次精确累加，产生副作用时精确清零。
    - 单元测试 100% 通过。

- [x] **Task 3: SessionRunner 跨 Turn 自动推进循环、三重安全熔断与 Steering 对接**
  - **目标**：在 `sessionRunner.ts` 的 `runOne` 周期后挂接 `postTurnGoalContinuation`；实现 Token 预算耗尽熔断（触发 `budget_limit`）、最大 Turn 限制（10 轮硬停）、停滞熔断（连续 2 轮无副作用自动 block）；在 `send` 中集成 `/goal` 识别及动态 Steering 目标更新；发射 `thread_goal_updated` 事件。
  - **涉及文件**：
    - `src/main/agent/sessionRunner.ts`
    - `src/main/agent/agentRunner.ts`
    - `src/main/ipc/agentHandlers.ts`
    - `src/preload/api/agent.ts`
    - `src/shared/ipc/agentChannels.ts`
    - `test/main/agent/goal/goalContinuation.test.ts`
  - **验证指标**：
    - 当 Goal 处于 active 且未达熔断线时，上一轮结束后自动且无缝发起下一轮 continuation。
    - 达 10 轮或预算耗尽时自动阻断并停机，绝不发生无限死循环。
    - 运行中用户发送文本可正确触发 Steering 并更新目标快照。

- [x] **Task 4: 前端 AgentGoalPill 状态胶囊、/goal 命令分发与国际化**
  - **目标**：在 `src/renderer/src/features/agent/` 实现 `AgentGoalPill` 组件，实时展示目标、轮次与预算进度条，提供暂停/取消交互；在输入区支持 `/goal` 快捷指令补全与提交；补齐中英文语言包，使用 CSS Token 适配多主题。
  - **涉及文件**：
    - `src/renderer/src/features/agent/components/AgentGoalPill.tsx`
    - `src/renderer/src/features/agent/AgentPage.tsx`
    - `src/renderer/src/features/agent/hooks/useAgentChat.ts`
    - `src/renderer/src/features/agent/components/AgentInput/AgentMarkdownInput.tsx`
    - `src/renderer/src/i18n/locales/zh.ts`
    - `src/renderer/src/i18n/locales/en.ts`
  - **验证指标**：
    - 输入 `/goal 实现用户登录功能` 成功创建并显示 Goal 胶囊。
    - 运行时实时反映轮次推进（如 `Turn 2/10`）与 Token 进度。
    - 点击暂停/取消能够立刻阻断后台连续循环。
    - 无硬编码中文，无固定十六进制颜色值。
