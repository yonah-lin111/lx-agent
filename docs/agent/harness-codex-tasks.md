# Codex Harness 全量重构任务清单

## 参考源说明
- **参考仓库**: `/Users/yonah/projects/agent/codex-main`
- **核心文件**:
  - `codex-rs/core/gpt_5_2_prompt.md`
  - `codex-rs/core/src/session/session.rs`
  - `codex-rs/core/src/session/input_queue.rs`
  - `codex-rs/core/src/session/environment.rs`

---

## 阶段与任务分解

### Phase 1: Harness 系统提示词全量规范与环境切片（当前阶段）
- [x] **Task 1.1: 完善 DEFAULT_BEHAVIOR_PROMPT 行为层规范**
  - 对齐 Preamble、Planning、Ambition vs Precision、安全边界、Anti-AI-Slop。
  - 文件: `src/main/agent/prompts/systemPromptManager.ts`
- [x] **Task 1.2: 强化环境信息注入与工作区感知**
  - 自动检测 `is_worktree`、`git_branch` 等并写入 `<env>` 块。
  - 文件: `src/main/agent/assembly.ts`
- [x] **Task 1.3: 补充系统提示词与环境收集单元测试**
  - 文件: `test/main/agent/prompts/systemPromptManager.test.ts`、`test/main/agent/agentRunner.systemPrompt.test.ts`

### Phase 2: Turn 状态机与 InputQueue 重构
- [x] **Task 2.1: 定义 TurnContext 数据结构与环境快照**
  - 将每次 Turn 的 `cwd`、`is_worktree`、`env`、`capabilities` 打包为不可变上下文。
  - 文件: `src/main/agent/core/turnContext.ts`
- [x] **Task 2.2: 升级 AgentRunner 的 InputQueue 处理机制**
  - 规范 FIFO 排队、drain 流程与运行中断（abort）状态清理。
  - 文件: `src/main/agent/agentRunner.ts`
- [x] **Task 2.3: 单测覆盖 Turn 隔离与队列流转**
  - 文件: `test/main/agent/turnContext.test.ts`

### Phase 3: 工具链与安全沙箱强化
- [x] **Task 3.1: 实现 CommandSafetyGuard 危险指令解析与安全判定**
  - 参考 Codex `is_dangerous_command.rs`，递归拆解 `sudo`、`env`、`sh -c` 等 shell 封装，对破坏性指令（`rm -rf /`、`git reset --hard`、`git clean -fdx` 等）实现硬性拦截与安全评级。
  - 文件: `src/main/agent/guard/commandSafetyGuard.ts`
- [x] **Task 3.2: 接入 PermissionManager 动态拦截流**
  - 在 `permissionManager.evaluate` 中集成 `commandSafetyGuard`，对危险指令直接 deny，敏感操作动态提升为 ask。
  - 文件: `src/main/agent/permissions/permissionManager.ts`
- [x] **Task 3.3: 编写安全沙箱与高危指令拦截单测**
  - 文件: `test/main/agent/guard/commandSafetyGuard.test.ts`

### Phase 4: 前端事件同步与全链路回归
- [x] **Task 4.1: 创建 .worktrees/feat-codex-frontend-sync 独立工作区**
- [ ] **Task 4.2: 前端 useAgentChat 与 AgentPage 状态流对齐**
  - 确认排队消息数、Turn 状态感知、Abort 中止响应及工作区标识正常展示。
  - 文件: `src/renderer/src/features/agent/hooks/useAgentChat.ts`、`src/renderer/src/features/agent/AgentPage.tsx`
- [ ] **Task 4.3: 全量 Agent 单测与回归验证**
  - 运行 `pnpm test test/main/agent` 以及前端 `test/renderer/features/agent`，确保 100% 通过。
