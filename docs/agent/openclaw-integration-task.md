# OpenClaw 接入实施任务拆解文档 (Task)

> 依据 `docs/agent/openclaw-integration-design.md`。除人工真机验证外，各阶段均已完成。

## 1. 任务概述

将 OpenClaw 接入从「底边栏聊天面板」重构为「独立页面 + 多目标扇出」，并补齐跨页委派。像素工作区曾在 Phase 4 实现，后已整体移除（见「变更记录」）。

---

## 2. 阶段与状态

### Phase 1：路由与外壳迁移
- [x] `lib/pageRoutes.ts` 新增 `/openclaw`
- [x] `lib/navigationItems.ts` 左栏底部导航新增 OpenClaw 项
- [x] `routes/PageRouter.tsx` 注册 `OpenClawPage`
- [x] `App.tsx` 按路由渲染 `OpenClawLeftSideBar`
- [x] 删除 `features/openclaw/components/OpenClawChatView.tsx`
- [x] `BottomSideBar` 移除 OpenClaw 视图与切换按钮，`viewMode` 收敛为 `"terminal" | "jobs"`
- [x] `bottomSideBarStore` 删除 OpenClaw 相关字段与方法
- **验收**：底边栏仅剩终端/长任务双视图；左栏底部出现 OpenClaw 入口，点击进入独立页面。

### Phase 2：状态与数据层
- [x] `openclawOfficeStore`：`selectedInstanceId` / `selectedAgentIds` / `pendingDispatch`（仅内存）
- [x] `hooks/useOpenClawConfig`：加载并订阅实例配置
- [x] `hooks/useOpenClawOffice`：并发连接实例 + 全量加载会话；`mergeOfficeTimeline` 纯函数合并时间线
- [x] `hooks/useOfficeAgentStatuses`：只读订阅员工状态
- [x] `agentStatus.ts`：会话快照 → 员工状态映射
- [x] `agentAccent.ts`：员工强调色取色规则
- **验收**：进入办公区后，所有员工均能反映真实连接/流式状态。

### Phase 3：对话视图与输入
- [x] `OpenClawConversationView`：多 Agent 消息交错渲染、来源标注、流式中提示、Markdown 渲染
- [x] `clawMention`：提及解析、整块删除范围、扇出目标解析（限定当前办公区）
- [x] `openclawCommands`：命令定义与模糊匹配
- [x] `OpenClawInput`：复用 Agent 输入框主题与面板，实现 `/` 命令、`@claw` 提及、选择面板
- [x] `OpenClawPickerPanel`：`/office`、`/agent` 选择面板
- [x] 多目标扇出发送（提及优先，否则选中集合）
- **验收**：一条消息可同时派发给多位员工；各员工回复按时间交错显示；底层上下文互不相通。

### Phase 4：跨页委派
- [x] 主输入框 `@claw` 拦截改为「写入 `pendingDispatch` + 跳转页面」
- [x] `lib/navigate.ts`：HashRouter 下的编程式导航（不依赖 Router 上下文）
- [x] 页面消费 `pendingDispatch`：落位 → 连接 → 发送
- **验收**：主界面输入 `@claw:<instance>/<agent> 任务` 后自动跳转 OpenClaw 页面并开始流式接收。

### Phase 5：文档与验证
- [x] 重写 `openclaw-integration-design.md` 与本文档
- [x] 纯逻辑单测：`agentStatus` / `clawMention` / `mergeOfficeTimeline` / `openclawCommands` / `openclawOfficeStore`
- [x] 组件渲染测试：`OpenClawConversationView` / `OpenClawLeftSideBar`
- [x] 渲染进程 `tsc` 类型检查与基线一致、无新增错误
- [x] 渲染进程测试套件无新增失败
- [ ] 人工验证：真实 Gateway 连接与流式、员工状态灯、扇出多员工并行回复

---

## 3. 变更记录

### 移除像素工作区
- [x] 删除 `office/officeLayout.ts`、`office/officePalette.ts`、`office/officeScene.ts`
- [x] 删除 `components/OpenClawOfficeView.tsx` 及对应单测
- [x] 移除 `pixi.js` 依赖（`package.json` / lockfile）
- [x] `openclawWorkspaceStore` → `openclawOfficeStore`，删除 `viewMode` / `setViewMode` / `toggleViewMode`
- [x] 页面移除模式切换按钮与双视图保活容器，只保留单一消息时间线
- [x] 移除 `/mode` 命令与 `modeConversation` / `modeWorkspace` / `officeEmpty` / `officeHint` / `commandModeDesc` 文案
- [x] `officePalette` 的 UI 取色迁至 `agentAccent.ts`

**原因**：员工状态与选中交互已由左栏名册完整承载，像素办公室属于重复表达，且带来额外依赖、渲染开销与维护面。

---

## 4. 验证方法

```bash
# 类型检查（渲染进程，与基线对比无新增错误）
pnpm exec tsc --noEmit -p tsconfig.web.json

# 本次新增/受影响测试
pnpm exec vitest run test/renderer/features/openclaw

# 底边栏回归
pnpm exec vitest run test/renderer/components/layout/BottomSideBar.test.tsx
```

---

## 5. 遗留与后续

- 命令集仅保留 5 个基础命令；`/export`（导出本办公区对话）等按需再加。
- 员工数量很大时名册仅靠滚动承载，暂未做虚拟化或分组。
- 真实 Gateway 的连接、流式与重连行为需在真机（Electron）环境人工确认。
