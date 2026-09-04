# Front Design Mode (<front_design>) 协议与协同任务清单

> **执行原则**：
> 1. 严格按单个 Task 独立执行，严禁一次性全量执行。
> 2. 每个 Task 需在 `.worktrees/` 下新建 Git 工作区执行。
> 3. Task 完成后执行单域验证并向用户汇报，征询用户同意后方可合并并推进下一 Task。

---

## 任务拆解与状态

- [x] **Task 1: CollaborationMode 扩展四态与 Main 进程门禁/提示词注入**
  - **目标**：在 Contracts 中扩展 `design` 模式，在 Main 进程中完成 3 个 render 工具（`render_svg`, `render_ascii`, `render_html`）的权限硬拦截，并注入 Front Design 专用 Prompt Harness。
  - **涉及文件**：
    - `src/shared/contracts/agent.ts`
    - `src/main/agent/permissions/permissionManager.ts`
    - `src/main/agent/prompts/systemPromptManager.ts`
  - **验证指标**：
    - 在 design 模式下调用 `render_svg`、`render_ascii`、`render_html` 时 `PermissionManager.checkAction()` 坚决返回 `deny`。
    - 生成的系统提示词中包含 `<front_design>` 英文规范与工具禁用说明。

- [x] **Task 2: AgentPage 快捷键流转与 AgentStatusBar 状态栏联动**
  - **目标**：支持 `Shift + Tab` 循环流转（build -> plan -> review -> design -> build），在 `AgentStatusBar` 中提供 `CollaborationModeButton` 的 Design 态视觉高亮与气泡提示。
  - **涉及文件**：
    - `src/renderer/src/features/agent/AgentPage.tsx`
    - `src/renderer/src/features/agent/hooks/useAgentChat.ts`
    - `src/renderer/src/features/agent/components/status-bar/CollaborationModeButton.tsx`
    - `src/renderer/src/i18n/locales/zh.ts`
    - `src/renderer/src/i18n/locales/en.ts`
  - **验证指标**：
    - 按 `Shift + Tab` 快捷键能在 4 种模式间稳定循环切换并伴有 Toast 提示。
    - `CollaborationModeButton` 在 Design 模式下正确渲染图标与文案。

- [x] **Task 3: 流式协议解析器、FrontDesignCard 与全局热更新存储**
  - **目标**：支持 `<front_design>` 标签的流式提取、生成 `ChatBlock` 并将最新设计代码推入响应式单例 `frontDesignStore`。
  - **涉及文件**：
    - `src/renderer/src/features/agent/types.ts`
    - `src/renderer/src/features/agent/utils.ts`
    - `src/renderer/src/features/agent/hooks/frontDesignStore.ts` (新建)
    - `src/renderer/src/features/agent/components/blocks/FrontDesignCard.tsx` (新建)
    - `src/renderer/src/features/agent/components/AgentMessageList/AgentMessageItem/AgentAssistantMessage.tsx`
  - **验证指标**：
    - Agent 输出 `<front_design>` 时聊天流展示优雅卡片，同时实时更新 `frontDesignStore`。

- [x] **Task 4: LeftSideBar 导航扩展与 FrontDesignPage 独立容器页面**
  - **目标**：在底部导航添加 Design Tab，新增 `/design` 路由与 `FrontDesignPage`，内部复用 Tailwind JIT 与沙箱 Iframe 渲染容器，监听 `frontDesignStore` 实现热更新，并在左侧栏提供空占位组件。
  - **涉及文件**：
    - `src/renderer/src/lib/pageRoutes.ts`
    - `src/renderer/src/lib/navigationItems.ts`
    - `src/renderer/src/routes/PageRouter.tsx`
    - `src/renderer/src/App.tsx`
    - `src/renderer/src/pages/front-design/FrontDesignPage.tsx` (新建)
    - `src/renderer/src/pages/front-design/components/FrontDesignLeftSideBar.tsx` (新建)
  - **验证指标**：
    - 点击底部导航 Design 图标无缝切换至 `/design` 页面。
    - 页面内沙箱 Iframe 自动渲染来自 Agent 的最新 HTML 代码，样式与高度测量逻辑与 `HtmlVisualContent` 完全对齐。
