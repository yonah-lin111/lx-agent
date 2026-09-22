# OpenClaw 员工选择器精简与办公区上下文（agent-select） 任务拆解

> 设计：`docs/feature/openclaw-agent-select/design.md`
> 工作区：`.worktrees/feat-openclaw-agent-select`（分支 `feat/openclaw-agent-select`，从 `dev` 切出）
> 说明：grill 1-7 决策见设计第 3 节。

## 阶段 0：工作区准备

### T0 创建 git 工作区

- **步骤**
  1. `git worktree add .worktrees/feat-openclaw-agent-select -b feat/openclaw-agent-select dev`
  2. 工作区内执行 `node scripts/setupWorktreeNodeModules.mjs`（链接主仓库 `node_modules`）。
- **期望**：工作区独立可跑测试与构建；主工作区 `dev` 仅多出本文档目录的提交。

## 阶段 1：组件契约收敛

### T1 `OpenClawTargetSelect.tsx` 精简为纯员工选择

- **步骤**
  1. `OpenClawTargetOffice` → `OpenClawTargetAgent { id, name }`；props 改为 `agents`/`selectedAgentIds`/`onToggleAgent`（+ `disabled`/`className`）。
  2. 删除办公区分组（标题与选项）与 `onSelectOffice`；保留 `agentPickerTitle` 分组标题与空态。
  3. 按钮文案三态：0 选中 → `agentPickerTitle`；1 → 员工名；≥2 → `agentCountLabel`（i18n）。
- **期望**：面板只列传入员工；按钮不再出现办公区名与硬编码 `N Agents`。

### T2 `OpenClawInput.tsx` props 收敛

- **步骤**
  1. 删除 `offices`/`selectedOfficeId`/`onSelectOffice`，新增 `agents`/`selectedAgentIds`/`onToggleAgent`。
  2. 渲染条件改为 `agents.length > 0 && onToggleAgent`。
- **期望**：输入框对外契约只保留员工多选；命令/提及/附件逻辑零改动。

## 阶段 2：上下文展示

### T3 `OpenClawBreadcrumb.tsx`（新增）

- **步骤**
  1. 读 `useOpenClawOfficeStore` 的 `selectedInstanceId` 与 `useOpenClawConfig` 的 `instances`，命中实例名渲染 `slash + LxTag` 段。
  2. 未选中或实例已不存在时返回 `null`。
- **期望**：组件可独立测试；不渲染时零副作用。

### T4 `HeaderSideBar.tsx` 接入

- **步骤**
  1. `pathname === PAGE_ROUTES.openclaw` 时在面包屑容器末尾渲染 `<OpenClawBreadcrumb />`。
  2. 由 `@/features/openclaw` 公开导出并导入（对齐「不得跨 feature 深层导入实现文件」规范）。
- **期望**：其它路由不挂载该组件、不加载 OpenClaw 配置。

### T5 页面工具条展示选中员工名

- **步骤**
  1. 派生 `selectedAgents`；工具条渲染 `办公区名 · 名称列表`（` · ` 连接，名称段 `truncate`）。
  2. 删除仅此地使用的 `activeAgent` memo。
- **期望**：左栏/select 多选后顶部即时显示全部选中员工名；无选中时只显示办公区名。

## 阶段 3：接线与文案

### T6 页面接线、i18n 与文档

- **步骤**
  1. `pages/openclaw/index.tsx` 删除 `offices` memo，改传 `agents`/`selectedAgentIds`/`onToggleAgent`。
  2. `features/openclaw/index.ts` 导出 `OpenClawTargetAgent`，去掉 `OpenClawTargetOffice`。
  3. `i18n/locales/{zh,en}/openclaw.ts` 新增 `agentCountLabel`。
  4. `docs/agent/openclaw.md`：员工多选来源补输入框选择器；办公区切换入口写明左栏 + `/office`；补面包屑办公区名说明。
- **期望**：无遗留旧 props/类型引用；zh/en 键一一对应；无硬编码中文。

## 阶段 4：测试与校验

### T7 测试

- **步骤**
  1. 改写 `test/renderer/features/openclaw/OpenClawInput.test.tsx`：面板无办公区分组、按钮三态文案、员工行 toggle 与勾选态。
  2. 新增 `test/renderer/features/openclaw/OpenClawBreadcrumb.test.tsx`：命中实例名 / 实例缺失 / 未选中。
  3. 扩展 `test/renderer/components/layout/HeaderSideBar.test.tsx`：openclaw 路由含办公区名，其它路由不含。
  4. 扩展 `test/renderer/pages/openclaw/OpenClawPage.test.tsx`：多选 → 顶部名称串联；单选 → 单个名称。
  5. 左栏 Ctrl 多选既有断言（`OpenClawLeftSideBar.test.tsx:96-106`）保留，不重复造。
- **期望**：覆盖设计第 9 节断言点。

### T8 精确校验

- **步骤**
  1. `pnpm exec vitest run test/renderer/features/openclaw test/renderer/pages/openclaw test/renderer/components/layout`
  2. `pnpm typecheck`
  3. `pnpm lint`（必要时 `pnpm format`）
- **期望**：全绿；无遗留旧函数名/旧 props 引用。

## 阶段 5：交付

### T9 提交

- **步骤**
  1. 工作区内 `git status` / `git diff` 复核，仅提交代码与测试。
  2. 提交拆分：`feat(openclaw): agent select 仅展示当前办公区员工`、`feat(openclaw): 面包屑与顶部工具条展示办公区上下文`、`test(openclaw): 覆盖选择器精简与办公区上下文`（可按实现边界微调）。
- **期望**：无文档/构建产物混入。

### T10 合并确认（询问用户）

- **步骤**
  1. 汇报测试与校验结果，询问是否 `git merge --no-ff` 合并回 `dev`。
  2. 合并后移除工作区与分支。
- **期望**：用户确认后才合并。

### T11 手工验收（由用户执行）

- **步骤**
  1. `pnpm dev` 进入 OpenClaw 页面。
  2. 输入框选择器：无办公区分组、按钮无办公区前缀、三态文案。
  3. 面包屑：`OPENCLAW / <办公区名>`；切区后跟随。
  4. 左栏 Ctrl/Cmd 多选与选择器多选 → 顶部显示全部选中员工名。
- **期望**：观感与设计第 10 节一致，无控制台异常。
