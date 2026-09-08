# Front Design 二次修改与 @设计卡片提及任务清单

> **执行原则**：
> 1. 严格按单个 Task 独立执行，严禁一次性全量执行。
> 2. 每个 Task 需在 `.worktrees/` 下新建 Git 工作区执行。
> 3. Task 完成后执行单域验证并编写单元测试，向用户汇报并征询同意后方可合并并推进下一 Task。

---

## 任务拆解与状态

- [ ] **Task 1: Contracts 契约与 FrontDesignStore 版本派生链扩展**
  - **目标**：在 `frontDesignStore` 中增加 `parentId` 与 `version` 计算，完善版本树聚合方法；在 `utils.ts` 中增强 `<front_design>` 属性提取以解析 `parent_id`。
  - **涉及文件**：
    - `src/renderer/src/features/agent/types.ts`
    - `src/renderer/src/features/agent/hooks/frontDesignStore.ts`
    - `src/renderer/src/features/agent/utils.ts`
  - **验证指标**：
    - 运行 `frontDesignStore` 单元测试，注册带有 `parentId` 的设计项能正确派生 `version` 并建立血缘关系。
    - `utils.ts` 解析带有 `parent_id="xxx"` 的标签能正确生成对应 `FrontDesignData`。

- [ ] **Task 2: AgentInput 支持 @ 提及并检索选中会话内设计卡片**
  - **目标**：扩展 `AgentMentionItem` 支持 `design` 类型；在 `useAgentInputPanels.ts` 中整合当前会话的设计项；在 `AgentInputCommandPanels.tsx` 中优雅展示 Palette 图标、标题与 Tag，并在选中时插入 `@design:{id} ({title})` Token。
  - **涉及文件**：
    - `src/renderer/src/features/agent/components/AgentInput/AgentInputCommandPanels.tsx`
    - `src/renderer/src/features/agent/components/AgentInput/AgentMarkdownInput/hooks/useAgentInputPanels.ts`
    - `src/renderer/src/features/agent/components/AgentInput/AgentMarkdownInput/hooks/useAgentInputActions.ts`
    - `src/renderer/src/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils.ts`
  - **验证指标**：
    - 在输入框键入 `@` 能看到当前会话历史设计卡片。
    - 点击或键盘回车选中后，能正确在文本框插入 `@design:{id} ({title}) ` 并保持聚焦。

- [ ] **Task 3: 消息发送端 Token 解析、上下文直接注入与系统提示词闭环**
  - **目标**：在发送流程中解析文本中的 `@design:{id}`，从 store 提取基准 HTML 拼装为 `<referenced_design>` 注入 LLM 上下文；在 `systemPromptManager.ts` 中注入二次修改的规则与 `parent_id` 协议约束。
  - **涉及文件**：
    - `src/renderer/src/features/agent/hooks/useAgentChat.ts`
    - `src/main/agent/prompts/systemPromptManager.ts`
  - **验证指标**：
    - 模拟发送带有 `@design:xxx` 的消息，LLM 接收到的消息上下文中包含完整的 `<referenced_design>` 标签与源码。
    - 系统提示词在 `design` 模式下包含明确的二次修改与 `parent_id` 契约约束。

- [ ] **Task 4: 聊天卡片 (FrontDesignCard) 与设计看板 (FrontDesignPage) 快捷迭代与版本切换**
  - **目标**：在 `FrontDesignCard` 中渲染版本徽标、血缘链接和【基于此迭代】快捷按钮（自动切为 design 模式并填入 token）；在 `FrontDesignPage` 顶部工具栏增加版本下拉选择器与【在对话中迭代】按钮；在左侧栏聚合版本分支。
  - **涉及文件**：
    - `src/renderer/src/features/agent/components/blocks/FrontDesignCard.tsx`
    - `src/renderer/src/pages/front-design/FrontDesignPage.tsx`
    - `src/renderer/src/pages/front-design/components/FrontDesignLeftSideBar.tsx`
    - `src/renderer/src/i18n/locales/zh.ts`
    - `src/renderer/src/i18n/locales/en.ts`
  - **验证指标**：
    - 聊天流中的二次修改卡片正确展示 `v2` 徽标。
    - 点击【基于此迭代】能自动切为 `design` 模式并将 `@design:...` 填入输入框。
    - `FrontDesignPage` 顶部能平滑切换同一原型的不同历史版本。

- [ ] **Task 5: 单元测试与端到端自动化验证**
  - **目标**：为新增的 Token 正则、版本派生链、Mention 组装、Prompt 格式化编写完备的 Vitest 测试用例。
  - **涉及文件**：
    - `test/renderer/features/agent/frontDesignStore.test.ts`
    - `test/renderer/features/agent/agentInputMentionDesign.test.ts`
    - `test/main/agent/prompts/systemPromptManager.test.ts`
  - **验证指标**：
    - 单测覆盖率达到 100% 关键分支，所有测试用例绿灯通过。
