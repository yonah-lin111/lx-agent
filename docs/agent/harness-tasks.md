# Harness 重构任务清单

本文档为 LX Agent 引入完整 Codex Harness 架构的实施任务拆分，分为四个阶段，所有代码修改均需在独立的 Git Worktree（`.worktrees/`）中执行。

---

## 阶段一：Harness 行为规范与提示词分层重构 (Prompt & Guidance Harness)

- [ ] **Task 1.1: 完善 `DEFAULT_BEHAVIOR_PROMPT`**
  - **位置**: `src/main/agent/prompts/systemPromptManager.ts`
  - **内容**: 补全 Preamble 意图输出规范、Planning 工具使用与状态流转规则、Ambition vs Precision 编码要求、针对性验证哲学、代码审查 (Review) 准则及前端 Anti-AI-Slop 约束。
  - **验证**: 运行 `pnpm test test/main/agent/prompts/systemPromptManager.test.ts`。

- [ ] **Task 1.2: 强化环境信息注入与工作区感知**
  - **位置**: `src/main/agent/prompts/systemPromptManager.ts`、`src/main/agent/assembly.ts`
  - **内容**: 完善 `<env>` 上下文构造，注入 Git Worktree 状态、当前工作分支及绝对路径。
  - **验证**: 单测验证 prompt 拼装产物中 `<env>` 字段的完整性。

---

## 2. 阶段二：Session & Turn 状态机与执行管线重构 (Execution Pipeline)

- [ ] **Task 2.1: 规范 `TurnContext` 与 `InputQueue` 数据模型**
  - **位置**: `src/main/agent/core/types.ts`、`src/main/agent/core/agent.ts`
  - **内容**: 引入严密的 `TurnContext` 状态封装，优化 `steeringQueue` 与 `followUpQueue` 的并发排队与原子消费机制。
  - **验证**: 运行 `pnpm test test/main/agent/agent-loop.test.ts`。

- [ ] **Task 2.2: 事务级落盘与状态同步 (TurnStore & AgentRunner)**
  - **位置**: `src/main/agent/turnStore.ts`、`src/main/agent/agentRunner.ts`
  - **内容**: 确保每个 Turn 在 `beginTurn` 与 `flushTurn` 中具有完整的崩溃恢复快照能力与状态投影。
  - **验证**: 运行会话持久化与恢复测试用例。

---

## 3. 阶段三：工作区隔离与 Git Worktree 执行保护

- [ ] **Task 3.1: 增强 `AgentRunner` 与工具链的工作区路径解析**
  - **位置**: `src/main/agent/assembly.ts`、`src/main/agent/tools/bash.ts`
  - **内容**: 强化对 `.worktrees/` 目录的自动探测与隔离执行保护，防止逃逸或误伤主分支。
  - **验证**: 模拟工作区切换与命令执行路径测试。

---

## 4. 阶段四：验证与合并

- [ ] **Task 4.1: 全链路受影响单测执行**
  - 执行 `pnpm test test/main/agent` 确保各核心模块无回归。
- [ ] **Task 4.2: 用户确认与合并**
  - 向用户汇报重构结果与测试报告，经确认后将 worktree 分支合并回主分支。
