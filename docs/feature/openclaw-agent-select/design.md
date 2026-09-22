# OpenClaw 员工选择器精简与办公区上下文（agent-select） 设计

> 需求来源：用户 3 条原文（agent select 不显示 office / 面包屑显示当前办公区 / 左栏与 select 多选后顶部显示选中员工名）
> 工作区：`.worktrees/feat-openclaw-agent-select`（分支 `feat/openclaw-agent-select`，从 `dev` 切出）
> 本文件记录 grill 1-7 的全部决策，作为实现与验收的唯一依据。

## 1. 目标

1. 输入框底部 agent select 只展示**当前办公区**的员工，不再展示与切换办公区。
2. `HeaderSideBar` 面包屑在 `/openclaw` 路由追加**当前办公区名**。
3. 左栏名册与 agent select 多选后，页面**顶部工具条**展示全部选中员工的名称。

## 2. 非目标

- 不改左栏办公区列表、员工名册的交互与 `openclawOfficeStore` 数据结构。
- 不改 `/office`、`/clear`、`/only`、`@claw`、附件、筛选 chips 等既有能力。
- 不新增办公区切换入口，不新增持久化状态。

## 3. 决策记录（grill 结论）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 选中员工展示位置 | `pages/openclaw/index.tsx` 顶部工具条，替换原「· 当前员工」；只显示名称，不显示 id |
| 2 | 面包屑取数方式 | `features/openclaw` 新增 `OpenClawBreadcrumb` 组件，`HeaderSideBar` 仅在 openclaw 路由条件渲染；实例缺失时不追加该段，不显示裸 id |
| 3 | 工具条结构 | 保留 `办公区名 · 员工名…`，名称段 `min-w-0 truncate`；无选中时只显示办公区名 |
| 4 | select 契约 | 删除办公区分组与 `offices`/`selectedOfficeId`/`onSelectOffice`；按钮三态：0 选中 → `agentPickerTitle`、1 → 员工名、≥2 → 新增 `agentCountLabel` |
| 5 | 办公区切换入口 | 左栏办公区列表 + `/office` 面板；`OpenClawLeftSideBar.tsx` 业务代码不改 |
| 6 | 文档与交付 | dev 先提交本目录两份文档；代码与测试在 worktree 分支提交；完成后询问是否合并 |
| 7 | 测试范围 | 改写 `OpenClawInput.test.tsx`、新增 `OpenClawBreadcrumb.test.tsx`、扩展 `HeaderSideBar.test.tsx` 与 `OpenClawPage.test.tsx`；左栏 Ctrl 多选既有断言保留 |

## 4. 现状约束（已核查）

- `OpenClawTargetSelect.tsx:18-26`：props 含 `offices`/`selectedOfficeId`/`onSelectOffice`；按钮文案 `${office.name} · ${name | N Agents | noAgents}`，其中 `N Agents` 为硬编码英文。
- `OpenClawInput.tsx:95-99`：可选 props `offices`/`selectedOfficeId`/`onSelectOffice` 仅透传给 select（`OpenClawInput.tsx:820-829`）。
- `pages/openclaw/index.tsx:175-183`：`offices` memo（`OpenClawTargetOffice[]`）只被 select 消费，`/office` 面板用的是 `enabledInstances`。
- `HeaderSideBar.tsx:146-154`：面包屑 parts 是字符串数组，openclaw 目前只有 `breadcrumbCategory: "OPENCLAW"`（`navigationItems.ts:40`）；`HeaderSideBar` 常驻 `App.tsx:78`，条件渲染 feature 面板已有先例（`HeaderSchedulePanel`/`HeaderUsagePanel`）。
- `pages/openclaw/index.tsx:553-556`：工具条显示 `办公区名 · activeAgent.name`；`activeAgent` 仅此处使用（`activeAgentId` 另供会话面板勾选态）。
- i18n：`officePickerTitle` 仍被 `/office` 面板使用，不可删除；`noAgents` 保留给名册与面板空态。

## 5. 数据结构与组件契约

### 5.1 `OpenClawTargetSelect.tsx`

```ts
export interface OpenClawTargetAgent {
  id: string
  name: string
}

export interface OpenClawTargetSelectProps {
  agents: OpenClawTargetAgent[]
  selectedAgentIds: string[]
  onToggleAgent: (agentId: string) => void
  disabled?: boolean
  className?: string
}
```

- 按钮文案：`selected = agents.filter((a) => selectedAgentIds.includes(a.id))`
  - `0` → `t("openclaw.agentPickerTitle")`
  - `1` → `selected[0].name`
  - `≥2` → `t("openclaw.agentCountLabel", { count: selected.length })`
- 面板：删除办公区分组（标题与选项），保留 `agentPickerTitle` 作为唯一分组标题；空态沿用 `noAgents`。
- 其余浮层定位 / 关闭逻辑 / 勾选样式不变。

### 5.2 `OpenClawInput.tsx`

```ts
  agents?: OpenClawTargetAgent[]
  selectedAgentIds?: string[]
  onToggleAgent?: (agentId: string) => void
```

渲染条件 `agents.length > 0 && onToggleAgent`（对齐原 `offices.length > 0 && onSelectOffice && onToggleAgent`）。

### 5.3 `OpenClawBreadcrumb.tsx`（新增）

- 输入：`useOpenClawOfficeStore.selectedInstanceId` + `useOpenClawConfig().instances`。
- 命中实例名 → 渲染一段 `slash + LxTag`，复用 `header-breadcrumb-slash` / `header-breadcrumb-part` 类名；否则返回 `null`。
- `HeaderSideBar` 在 `pathname === PAGE_ROUTES.openclaw` 时渲染于面包屑容器末尾；hook 只在该路由挂载，避免全站加载 OpenClaw 配置。

### 5.4 页面工具条（`pages/openclaw/index.tsx`）

```ts
const selectedAgents = agents.filter((agent) => selectedAgentIds.includes(agent.id))
```

渲染 `办公区名 · names.join(" · ")`；名称段 `min-w-0 truncate`，挤压时省略；`selectedAgentIds` 为空时退回只显示办公区名。删除仅此处使用的 `activeAgent` memo。

## 6. i18n 键

| key | zh | en |
|---|---|---|
| `openclaw.agentCountLabel` | `{{count}} 名员工` | `{{count}} agents` |

其余键不变；无硬编码中文，无新增原生 `title`。

## 7. 实现拆分（文件级）

| 文件 | 动作 |
|---|---|
| `src/renderer/src/features/openclaw/components/OpenClawTargetSelect.tsx` | 改 props、删办公区分组、按钮三态 |
| `src/renderer/src/features/openclaw/components/OpenClawInput.tsx` | props 收敛与透传 |
| `src/renderer/src/features/openclaw/components/OpenClawBreadcrumb.tsx` | 新增 |
| `src/renderer/src/features/openclaw/index.ts` | 导出调整（去 `OpenClawTargetOffice`，加 `OpenClawTargetAgent`） |
| `src/renderer/src/components/layout/HeaderSideBar.tsx` | openclaw 路由条件渲染面包屑段 |
| `src/renderer/src/pages/openclaw/index.tsx` | 删 `offices` memo 与 `activeAgent`，工具条展示选中员工名 |
| `src/renderer/src/i18n/locales/{zh,en}/openclaw.ts` | 新增 `agentCountLabel` |
| `docs/agent/openclaw.md` | 同步「员工多选来源 / 办公区切换入口 / 面包屑办公区名」 |

## 8. 已知限制与风险

- 输入框不再能切办公区（有意为之）：切区改用左栏列表或 `/office`。
- 面包屑名称依赖配置异步加载：首帧可能只有 `OPENCLAW`，配置到达后补齐（与项目面包屑行为一致）。
- 顶部名称集合过长时截断，不换行、不折叠为计数。

## 9. 测试

断言点见 `task.md` 阶段 4；验证命令：`pnpm exec vitest run test/renderer/features/openclaw test/renderer/pages/openclaw test/renderer/components/layout`、`pnpm typecheck`、`pnpm lint`。

## 10. 验收

1. agent select 面板无办公区分组；按钮无办公区前缀，三态文案正确。
2. `/openclaw` 面包屑为 `OPENCLAW / <办公区名>`；实例缺失时退回 `OPENCLAW`。
3. 左栏 Ctrl/Cmd 多选、select 多选后，顶部工具条显示全部选中员工名；单选与现状一致。
4. 相关测试、typecheck、lint 全绿。
