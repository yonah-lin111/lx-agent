# Plan Mode (<proposed_plan>) 协议与执行门禁任务清单

> **执行原则**：
> 1. 严格按单个 Task 独立执行，严禁一次性全量执行。
> 2. 每个 Task 需在 `.worktrees/` 下新建 Git 工作区执行。
> 3. Task 完成后执行单域验证并向用户汇报，征询用户同意后方可合并并推进下一 Task。

---

## 任务拆解与状态

- [x] **Task 1: Plan Mode 提示词分层升级与 PermissionManager 硬门禁**
  - **目标**：在 Main 进程中完成 Plan Mode 的 3 阶段 Prompt Harness 升级与写操作/todowrite 硬拦截。
  - **涉及文件**：
    - `src/main/agent/prompts/systemPromptManager.ts`
    - `src/main/agent/permissions/permissionManager.ts`
  - **验证指标**：
    - Plan 模式下 prompt 输出包含严格的 `<proposed_plan>` 规范与 3 阶段英文指令。
    - 在 Plan 模式下调用 `write`、`edit`、`apply_patch`、`todowrite` 时 `PermissionManager.checkAction()` 必须坚决返回 `deny`。

- [ ] **Task 2: 渲染器 ProposedPlanBlock 契约与 AST/Tag 消息解析器**
  - **目标**：在 Renderer 层支持 `<proposed_plan>` 的提取与结构化 Block 构建。
  - **涉及文件**：
    - `src/renderer/src/features/agent/types.ts`
    - `src/renderer/src/features/agent/executionFlow.ts`
    - `src/renderer/src/features/agent/messageGrouping.ts`
  - **验证指标**：
    - Assistant 消息中的 `<proposed_plan>` 能被正确提取为 `kind: "proposedPlan"` 块，正文中多余 tag 标记被干净剥离。
    - 普通文本和思考块不受影响，支持流式解析下的容错。

- [ ] **Task 3: ProposedPlanCard 交互组件与状态机流转闭环**
  - **目标**：实现高质感 Plan 计划卡片，支持一键采纳执行、复制计划及国际化适配。
  - **涉及文件**：
    - `src/renderer/src/features/agent/components/blocks/ProposedPlanCard.tsx` (新建)
    - `src/renderer/src/features/agent/components/AgentMessageList/AgentMessageList.tsx`
    - `src/renderer/src/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowList.tsx`
    - `src/renderer/src/i18n/locales/zh-CN.json`
    - `src/renderer/src/i18n/locales/en-US.json`
  - **验证指标**：
    - 点击「采纳并执行」能成功切换 `collaborationMode` 至 `default` 并自动发送 `"Plan approved. Proceed with implementation step-by-step using todowrite."`。
    - 样式全部基于 `--color-theme-*` CSS Token，多语言完整覆盖无硬编码中文。
