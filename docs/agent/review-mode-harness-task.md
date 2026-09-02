# Review Mode (<review_findings>) 协议与执行门禁任务清单

> **执行原则**：
> 1. 严格按单个 Task 独立执行，严禁一次性全量执行。
> 2. 每个 Task 需在 `.worktrees/` 下新建 Git 工作区执行。
> 3. Task 完成后执行单域验证并向用户汇报，征询用户同意后方可合并并推进下一 Task。

---

## 任务拆解与状态

- [x] **Task 1: CollaborationMode 统一升级为 `build` / `plan` / `review` 与 Main 进程安全/提示词门禁**
  - **目标**：重构 `CollaborationMode` 枚举（向后兼容归一化 `"default"` -> `"build"`），并在 `SystemPromptManager` 与 `PermissionManager` 中实现 Review 模式的 4 维审查 Prompt 注入与写操作硬拦截。
  - **涉及文件**：
    - `src/shared/contracts/agent.ts`
    - `src/main/agent/prompts/systemPromptManager.ts`
    - `src/main/agent/permissions/permissionManager.ts`
    - `src/main/agent/sessionRunner.ts`
    - `src/main/agent/assembly.ts`
  - **验证指标**：
    - Review 模式下生成的 prompt 包含严格的 `<review_findings>` XML 格式契约与审查标准。
    - Review 模式下调用 `write`、`edit`、`apply_patch`、`todowrite` 均被 `PermissionManager` 阻断。
    - 历史会话恢复时 `"default"` 正常兼容解析为 `"build"`。

- [x] **Task 2: ReviewFindings 消息契约与 AST/Tag 提取器解析支持**
  - **目标**：在 Renderer 层支持 `<review_findings>` 标签提取，构造 `kind: "reviewFindings"` 的结构化 ChatBlock 与 ExecutionStep。
  - **涉及文件**：
    - `src/renderer/src/features/agent/types.ts`
    - `src/renderer/src/features/agent/utils.ts`
    - `src/renderer/src/features/agent/executionFlow.ts`
    - `src/renderer/src/features/agent/components/AgentMessageList/AgentMessageItem/hooks/useMessageItemGroups.ts`
  - **验证指标**：
    - Assistant 消息中的 `<review_findings>` 能被正确提取为结构化的 `findings` 列表、问题严重等级与摘要，正文标签被干净剥离。
    - 在流式接收和中断恢复场景下解析具备容错能力。

- [x] **Task 3: ReviewFindingsCard 交互卡片与状态栏/输入框闭环流转**
  - **目标**：实现 `ReviewFindingsCard` 组件，支持勾选、代码行跳转、一键修复与一键填入，并在状态栏与 Slash 命令中支持 `build`/`plan`/`review` 切换。
  - **涉及文件**：
    - `src/renderer/src/features/agent/components/blocks/ReviewFindingsCard.tsx` (新建)
    - `src/renderer/src/features/agent/components/blocks/index.ts`
    - `src/renderer/src/features/agent/components/status-bar/CollaborationModeButton.tsx`
    - `src/renderer/src/features/agent/components/AgentMessageList/AgentMessageItem/AgentAssistantMessage.tsx`
    - `src/renderer/src/features/agent/hooks/useAgentChat.ts`
    - `src/renderer/src/i18n/locales/zh.ts`
    - `src/renderer/src/i18n/locales/en.ts`
  - **验证指标**：
    - 点击「采纳并修复选中项」能自动切回 `build` 模式并自动发送修复 Prompt。
    - 状态栏协作模式指示按 `Build -> Plan -> Review` 循环切换，样式与国际化完整适配。
