# Context Window Guidance Harness 任务清单

> **执行原则**：
> 1. 严格按单个 Task 独立执行，严禁一次性全量执行。
> 2. 每个 Task 需在 `.worktrees/` 下新建 Git 工作区执行。
> 3. Task 完成后执行单域验证并向用户汇报，征询用户同意后方可合并并推进下一 Task。

---

## 任务拆解与状态

- [x] **Task 1: AssembleContext 契约扩展与 SystemPromptManager 上下文容量 Guidance 注册**
  - **目标**：在 `AssembleContext` 中支持 `contextUsage`，并在 `SystemPromptManager` 注册 `harness:context-window-guidance`（order: 358），实现双阈值 `<context_window_guidance>` 动态生成与单元测试。
  - **涉及文件**：
    - `src/main/agent/prompts/systemPromptManager.ts`
    - `src/shared/contracts/agent.ts`
    - `test/main/agent/prompts/systemPromptManager.test.ts`
  - **验证指标**：
    - 当 usage < 75% 时返回空字符串，不产生任何上下文注入。
    - 当 75% <= usage < 90% 时生成 level="warning" 的 Guidance XML 块。
    - 当 usage >= 90% 时生成 level="critical" 的收敛与压缩建议 Guidance 块。

- [x] **Task 2: sessionRunner 与 assembly 全链路贯通及执行流程透明化**
  - **目标**：在 `buildSystemPromptSync`、`buildSystemPrompt` 及 `sessionRunner.ts` 的提示词装配流程中传入 `contextUsage`，使执行流程面板能够透明查看容量引导信息。
  - **涉及文件**：
    - `src/main/agent/assembly.ts`
    - `src/main/agent/sessionRunner.ts`
    - `test/main/agent/sessionRunner.test.ts`（或新建装配验证单测）
  - **验证指标**：
    - 运行中进入高上下文场景时，`getPromptAssembly()` 的 `contexts` 中包含 `harness:context-window-guidance`。
    - 历史压缩完成后使用率回落，Guidance 自动消失并恢复零污染状态。

- [x] **Task 3: 前端 ContextUsagePill 阈值对齐与预警视觉增强**
  - **目标**：对齐前端 `AgentContextUsagePill` 与双阈值阶段，当 >=90% 时呈现高危警示状态，优化 Tooltip 文案与国际化提示。
  - **涉及文件**：
    - `src/renderer/src/features/agent/components/AgentContextUsagePill.tsx`
    - `src/renderer/src/i18n/locales/zh.ts`
    - `src/renderer/src/i18n/locales/en.ts`
  - **验证指标**：
    - 状态栏与输入框上容量 Pill 的颜色阶段（<75% 绿，75-90% 琥珀，>=90% 红色脉冲）与底层 Harness 完全保持一致。
    - 国际化文案完整，无硬编码。
