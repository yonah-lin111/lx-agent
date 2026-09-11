# Token Usage 任务拆解

> 工作区：`.worktrees/feat-token-usage`（分支 `feat/token-usage`）
> 设计：`docs/token-usage/design.md`

## 阶段 1：数据契约与存储

- [x] T1 `src/shared/contracts/agent.ts`：`Usage` 增加 `cacheWrite`
- [x] T2 `src/shared/contracts/usage.ts`：日志/查询/聚合 DTO、`computeUsageRates`、`resolveUsageRange`
- [x] T3 `src/main/db/migrations/0010_create_usage_log.ts` + `migrations/index.ts` 注册
- [x] T4 `src/main/services/usageLogService.ts`：record / listLogs / summary / daily / modelStats / providerStats / filterOptions

验收：迁移可重复执行；未配置价格时成本列为 NULL；聚合 SQL 通过单测。

## 阶段 2：采集与推送

- [x] T5 `src/main/agent/usageRecorder.ts`：pricing 解析、session→project 快照、广播回调
- [x] T6 `aiSdkStreamFn`：options 增加 `purpose` / `getSessionId`，每次调用（单 step）落库，error/abort 落库
- [x] T7 `sessionRunner` / `task.ts` 传 purpose 与 sessionId
- [x] T8 `compaction` 调用处（contextCompactor）记录成功/失败
- [x] T9 `generateSessionTitle` / `generateTemplateTitle` / `generateSuggestedQuestions` 记录成功/失败（标题与会话调用补 sessionId）
- [x] T10 `src/shared/ipc/usageChannels.ts` + `src/main/ipc/usageHandlers.ts` + `main/index.ts` 注册 + 事件推送

验收：手动聊天/子代理/压缩/标题/建议问题各触发一次后，`usage_log` 行数与 purpose 正确；页面挂载时能收到 `logRecorded` 事件。

## 阶段 3：计价配置

- [x] T11 `src/shared/settings.ts`：`ModelProviderModel.pricing` 可选字段
- [x] T12 `ModelProviderSettings.tsx`：模型卡展开区 4 个单价输入（USD / 1M，空 = 未配置）
- [x] T13 设置保存/读取回归：旧配置无 pricing 不报错

验收：填写单价保存后，新请求日志成本正确；修改单价不影响历史日志成本。

## 阶段 4：IPC / preload

- [x] T14 `src/preload/api/usage.ts` + `src/preload/index.ts` 注册 `window.api.usage`
- [x] T15 renderer `features/usage/api/usageApi.ts` 对接

验收：`window.api.usage.listLogs/getSummary/...` 类型与 DTO 一致。

## 阶段 5：Renderer 页面

- [x] T16 `features/usage/hooks/useUsageData.ts`：筛选状态、查询、事件订阅、手动刷新
- [x] T17 汇总卡 + 5 图（趋势/请求柱状/模型分布/Provider 环形/Token 构成）
- [x] T18 3 表（请求日志分页 / 模型统计 / Provider 统计）
- [x] T19 筛选（时间预设 / Provider / Model / Project，Provider→Model 级联）
- [x] T20 `pages/usage/index.tsx` + `PAGE_ROUTES.usage` + `PageRouter` + `App.tsx` 侧栏条件
- [x] T21 `HomeLeftSideBar` 两项与 pathname 激活态（含折叠态）
- [x] T22 i18n：`zh.ts` / `en.ts` 新增 `usage.*` 键

验收：`/usage` 可直达；侧栏两项可切换且高亮正确；筛选、分页、刷新行为符合设计；无硬编码文案与颜色。

## 阶段 6：测试与验证

- [x] T23 shared 单测：`computeUsageRates` / `resolveUsageRange`
- [x] T24 main 单测：`usageLogService`（记录/成本/聚合/筛选/分页）、`usageRecorder`
- [x] T25 renderer 测试：格式化工具、表格、筛选 hook
- [x] T26 `pnpm test`（受影响范围）+ `pnpm typecheck` + `pnpm lint`

## 阶段 7：交付

- [x] T27 提交代码（不含主工作区未提交改动）
- [ ] T28 询问用户是否合并回 `dev`
