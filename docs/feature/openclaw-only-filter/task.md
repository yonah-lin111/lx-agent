# OpenClaw 消息列表员工筛选（/only） 任务拆解

> 设计：`docs/feature/openclaw-only-filter/design.md`
> 工作区：`.worktrees/feat-openclaw-only-filter`（分支 `feat/openclaw-only-filter`，从 `dev` 切出）→ **已合并回 `dev`（合并提交 `0a7fa7b8`），工作区与分支已移除**
> 说明：本文件按最终确认结果重写，包含 grill 1-12 的全部决策；各阶段均已执行完毕。

## 阶段 0：工作区准备

### T0 创建 git 工作区

- **步骤**
  1. `git worktree add .worktrees/feat-openclaw-only-filter -b feat/openclaw-only-filter dev`
  2. 工作区内执行 `node scripts/setupWorktreeNodeModules.mjs`（链接主仓库 `node_modules`）。
- **期望**：工作区独立可跑测试与构建；主工作区 `dev` 无代码改动（设计/任务文档留在主工作区 `docs/feature/`，不随提交入库）。

## 阶段 1：数据层

### T1 命令体系扩展（`openclawCommands.ts`）

- **步骤**
  1. `OpenClawCommandId` 扩展；`OPENCLAW_COMMANDS` 追加 `/only`（`keepText: true`）。
  2. `splitClearAgentNames` → `splitCommandAgentNames`、`toggleClearAgentName` → `toggleCommandAgentName(current, commandId, name)`（`/clear`、`/only` 共用），更新全部引用。
  3. `getMatchedOpenClawCommands` 增加 `canOnly` 参数：`/only` 仅在可见性允许时出现。
- **期望**：既有 `/clear` 行为与文案零变化；`/only` 可被命令面板召回。

### T2 office store 增加 only 状态

- **步骤**
  1. `onlyAgentIds: string[] | null` + `setOnlyAgentIds`（去重、剔除空串、空数组归一化为 `null`）。
  2. `selectOffice` 一并置 `null`。
- **期望**：`setOnlyAgentIds([])` 与 `setOnlyAgentIds(null)` 等价；切办公区后筛选清空。

### T3 时间线过滤纯函数

- **步骤**
  1. `filterOfficeTimeline(timeline, onlyAgentIds)`：`null` 时返回原引用；否则保留 `(targetAgentIds ?? [agentId])` 有交集的条目。
  2. `features/openclaw/index.ts` 导出。
- **期望**：扇出消息对任一选中员工可见；展示的目标名单不裁剪。

## 阶段 2：交互层

### T4 输入框命令可见性与 Esc 语义（`OpenClawInput.tsx`）

- **步骤**
  1. 新增 `onlyCommandAvailable` prop 并透传给 `getMatchedOpenClawCommands`；可见性变化时按当前文本刷新已打开的命令面板。
  2. Esc 关闭**文本派生**面板（`picker.commandId` 存在）时连同清空编辑器文本；显式面板（`/office`）保持原行为。
- **期望**：`/only` 按候选数出现/隐藏；Esc 后不残留 `/only …` 文本，已应用筛选不回滚。

### T5 消息列表过滤空态（`OpenClawMessageList.tsx`）

- **步骤**
  1. 新增 `isFiltered?: boolean`；空列表时切换 `openclaw.conversationFilteredEmpty`。
- **期望**：只有被过滤到空时才显示专属文案；删除入口仍由传入 timeline 计算（页面传过滤后列表即自动一致）。

### T6 页面装配（`pages/openclaw/index.tsx`）

- **步骤**
  1. `visibleTimeline` 计算并传入消息列表（附 `isFiltered`）。
  2. `/only` picker 分支：`multiSelect`、Space 实时应用（改写文本 → 解析员工名 → `setOnlyAgentIds`）。
  3. `handleSend` 增加 `/only` 裁决（空参数保持面板；全不匹配 toast 并清空；否则应用并清空）。
  4. 顶栏：`筛选：` + 员工 `LxTag`（`×` 移除）、恢复按钮（非 only 禁用）。
  5. 失效清理 effect 追加 `onlyAgentIds` 裁剪。
- **期望**：`/only` → Space 实时收窄；Enter/Esc 收尾；切区/员工失效自动收敛；发送扇出与 `@claw` 逻辑零改动。

## 阶段 3：文案与文档

### T7 i18n、命令文档与滚动条变量

- **步骤**
  1. `i18n/locales/{zh,en}/openclaw.ts` 新增筛选相关键（见设计第 8 节）。
  2. `docs/agent/openclaw.md` 命令表补 `/only` 与面板候选规则。
  3. `styles.css` 新增 `--lx-scrollbar-size` 并被 `::-webkit-scrollbar` 引用（宽 6px 保持原值）。
- **期望**：zh / en 键一一对应；无硬编码中文；无新增原生 `title`。

## 阶段 4：测试与校验

### T8 单元测试

- **步骤**
  1. 新增 `test/renderer/features/openclaw/filterOfficeTimeline.test.ts`。
  2. 扩展 `openclawCommands.test.ts`、`openclawOfficeStore.test.ts`、`OpenClawInput.test.tsx`、`OpenClawMessageList.test.tsx`。
- **期望**：覆盖设计第 10 节断言点。

### T9 页面集成测试

- **步骤**
  1. 新增 `test/renderer/pages/openclaw/OpenClawPage.onlyFilter.test.tsx`（桩输入框驱动页面接线）。
  2. 更新 `test/renderer/pages/openclaw/OpenClawPage.test.tsx` 的模块 mock（新导出符号）。
- **期望**：面板 → 列表 → 恢复主链路全部可断言。

### T10 精确校验

- **步骤**
  1. `pnpm exec vitest run test/renderer/features/openclaw test/renderer/pages/openclaw`
  2. `pnpm typecheck`
  3. `pnpm lint`（必要时 `pnpm format`）
- **期望**：全绿；无遗留旧函数名引用。

## 阶段 5：补充需求（grill 8-12）

### T11 面板候选收窄 + 撤销 `/all`

- **步骤**
  1. `OpenClawCommandId` 去掉 `all`，删除 `/all` 规格与 i18n 键；`getMatchedOpenClawCommands` 第三参数简化为 `canOnly: boolean`。
  2. 页面派生 `timelineAgentIds`（完整时间线的 `agentId ∪ targetAgentIds`）与 `timelineAgents`；`onlyCommandAvailable = timelineAgents.length > 1`。
  3. `/only` 与 `/clear` 两个 picker 的员工行改用 `timelineAgents`。
- **期望**：面板只出现消息列表中出现过的员工；时间线不足两名员工时 `/only` 不出现在命令面板。

### T12 面板「全部员工」行

- **步骤**
  1. 新增 `toggleAllCommandAgentNames(current, commandId, names)`：候选已全部在参数中 → 清空参数；否则去重后一次性写入。
  2. 两面板首位插入保留 id `"__all__"` 的「全部员工」行：`/only` 勾选态 = `onlyAgentIds === null`，Space → 文本回到裸 `/only` + `setOnlyAgentIds(null)`；`/clear` 勾选态 = 候选名称全在参数中，Space → `toggleAllCommandAgentNames`，Enter 仍按既有语义建会话。
- **期望**：`/only` 一键显示全部；`/clear` 一键全选/清空参数。

### T13 输入区宽度对齐

- **步骤**
  1. 输入区 `px-3` → `px-4` + 内层 `mx-auto w-full max-w-3xl`；`OpenClawInput` 根节点去掉水平 `p-0.5`。
  2. 再把右侧改为 `pr-[calc(1rem_+_var(--lx-scrollbar-size))]`，镜像消息列的 `scrollbar-gutter` 预留槽。
- **期望**：宽屏与窄窗下输入框边框盒都与消息列完全等宽、左缘一致；面板锚点（`fixed` + 容器 rect）不受影响。

### T14 `/` 命令模糊规则对齐 AgentInput

- **步骤**
  1. 匹配改为「名称/别名（`clear→new`）∪ tag `getCommandTagLabel({kind:"builtin"})`」，本地化描述不再参与。
- **期望**：`/bltin` 召回全部内置命令；`/new` 命中 `/clear`；`/选择` 不再命中。

### T15 `@` 提及规则共享

- **步骤**
  1. `agentMarkdownInputUtils.ts` 抽出 `filterClawMentionCandidates(candidates, query)`；`useAgentInputPanels` 的 claw 分支与 `OpenClawInput` 的提及分支都改用它。
- **期望**：`@cla` 整类返回；`@claw:local/lily` 精确过滤；`@amy` 按名称命中；`@xyz` 不出面板；AgentInput 既有 claw 用例保持通过。

### T16 AI 消息始终展示模型名

- **步骤**
  1. `ConversationAgent` 增加 `model?`；页面从 `snapshot.stats.model` 注入。
  2. 列表派生 `modelByMessageId`：消息自带 → 同一 Agent 最近一条记录 → 会话当前模型；逐条传给消息项。
  3. `OpenClawMessageItemProps` 增加 `model?`（缺省回落 `message.model`）。
- **期望**：每条 AI 消息都显示模型名；模型回退按 Agent 隔离；消息自带优先于会话模型。

## 阶段 6：交付

### T17 手工验收（由用户执行）

- **步骤**
  1. `pnpm dev`，进入 OpenClaw 页面（办公区 ≥ 2 名员工）。
  2. `/only` 空格多选 → 列表实时收窄；Enter / Esc 收尾；顶部 chips、`×`、恢复按钮、两面板「全部员工」行。
  3. 切换办公区、禁用员工后回页，确认筛选重置/裁剪。
  4. 输入框与消息列边缘、AI 消息模型名、`/bltin`、`/new`、`@cla`、`@amy` 逐项确认。
- **期望**：主链路与观感符合设计第 11 节验收项；无控制台异常。

### T18 提交与合并确认

- **步骤**
  1. 工作区内 `git status` / `git diff` 复核，仅提交代码与测试。
  2. 分 5 次提交（见设计第 12 节提交列表）。
  3. 合并回 `dev`（`git merge --no-ff`），移除工作区与分支。
- **期望（已完成）**：合并提交 `0a7fa7b8`，无冲突；`dev` 上复跑四套件 117 文件 / 887 用例全过，typecheck / lint 全绿；`.worktrees/feat-openclaw-only-filter` 与 `feat/openclaw-only-filter` 均已移除。
